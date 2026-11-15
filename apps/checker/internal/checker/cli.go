package checker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"text/tabwriter"
	"time"
)

// Exit codes.
const (
	ExitOK          = 0
	ExitChecksFail  = 1
	ExitUsage       = 2
	ExitSubmitError = 3
)

// App wires the CLI to its dependencies; tests replace any of them.
type App struct {
	Version       string
	DefaultAPIURL string
	Stdout        io.Writer
	Stderr        io.Writer
	Env           Env
	// Poster sends the signed submission; defaults to an HTTP POST.
	Poster func(ctx context.Context, apiURL string, sub Submission) (*SubmitResponse, error)
	Now    func() time.Time
	Getenv func(string) string
}

// SubmitResponse is the API's reply to POST /checker/results.
type SubmitResponse struct {
	OK     bool   `json:"ok"`
	Passed bool   `json:"passed"`
	Error  string `json:"error"`
	Status int    `json:"-"`
}

// NewApp returns an App wired to real docker/kubectl/HTTP.
func NewApp(version, defaultAPIURL string) *App {
	return &App{
		Version:       version,
		DefaultAPIURL: defaultAPIURL,
		Stdout:        os.Stdout,
		Stderr:        os.Stderr,
		Env:           Env{Runner: ExecRunner{}, HTTP: NewHTTPClient()},
		Poster:        PostSubmission,
		Now:           time.Now,
		Getenv:        os.Getenv,
	}
}

const usageText = `fde-checker — verify FDE platform real-world levels on your own machine.

Usage:
  fde-checker login <token> [--api URL]   Save your checker token (copy it from the level page)
  fde-checker verify <level-id> [--no-submit] [--api URL]
                                          Run the checks for a level and send the signed result
  fde-checker list                        List levels this checker can verify
  fde-checker logout                      Forget the saved token
  fde-checker version

The checker is read-only. It runs commands like "docker image inspect" and
"kubectl get deployment", and never changes anything on your machine.
`

// Run executes the CLI and returns the process exit code.
func (a *App) Run(args []string) int {
	if len(args) == 0 {
		fmt.Fprint(a.Stdout, usageText)
		return ExitUsage
	}
	switch args[0] {
	case "login":
		return a.login(args[1:])
	case "logout":
		if err := DeleteConfig(); err != nil {
			fmt.Fprintln(a.Stderr, "Could not remove the saved token:", err)
			return ExitUsage
		}
		fmt.Fprintln(a.Stdout, "Logged out. The saved token was removed from this computer.")
		return ExitOK
	case "verify", "run":
		return a.verify(args[1:])
	case "list":
		for _, id := range LevelIDs() {
			fmt.Fprintf(a.Stdout, "%s  %s\n", id, Levels[id].Title)
		}
		return ExitOK
	case "version", "--version", "-v":
		fmt.Fprintln(a.Stdout, "fde-checker", a.Version)
		return ExitOK
	case "help", "--help", "-h":
		fmt.Fprint(a.Stdout, usageText)
		return ExitOK
	default:
		fmt.Fprintf(a.Stderr, "Unknown command %q.\n\n%s", args[0], usageText)
		return ExitUsage
	}
}

// splitArgs separates positional arguments from flags so flags may come after them.
func splitArgs(args []string) (positional, flags []string) {
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "-") {
			flags = append(flags, arg)
			if !strings.Contains(arg, "=") && arg != "--no-submit" && arg != "-no-submit" && i+1 < len(args) {
				flags = append(flags, args[i+1])
				i++
			}
			continue
		}
		positional = append(positional, arg)
	}
	return positional, flags
}

func (a *App) login(args []string) int {
	positional, flagArgs := splitArgs(args)
	fs := flag.NewFlagSet("login", flag.ContinueOnError)
	fs.SetOutput(a.Stderr)
	api := fs.String("api", "", "API base URL")
	if err := fs.Parse(flagArgs); err != nil {
		return ExitUsage
	}
	if len(positional) != 1 {
		fmt.Fprintln(a.Stderr, "Usage: fde-checker login <token>")
		return ExitUsage
	}
	token := strings.TrimSpace(positional[0])
	if !TokenPattern.MatchString(token) {
		fmt.Fprintln(a.Stderr, "That does not look like a checker token. It starts with fdec_ and is 48 characters long. Copy it again from the level page.")
		return ExitUsage
	}
	cfg, _ := LoadConfig()
	cfg.Token = token
	if *api != "" {
		cfg.APIURL = strings.TrimRight(*api, "/")
	}
	path, err := SaveConfig(cfg)
	if err != nil {
		fmt.Fprintln(a.Stderr, "Could not save the token:", err)
		return ExitUsage
	}
	fmt.Fprintf(a.Stdout, "Saved your checker token to %s\nNext: fde-checker verify <level-id>\n", path)
	return ExitOK
}

func (a *App) apiURL(flagValue string, cfg Config) string {
	switch {
	case flagValue != "":
		return strings.TrimRight(flagValue, "/")
	case a.Getenv("FDE_API_URL") != "":
		return strings.TrimRight(a.Getenv("FDE_API_URL"), "/")
	case cfg.APIURL != "":
		return cfg.APIURL
	default:
		return a.DefaultAPIURL
	}
}

func (a *App) verify(args []string) int {
	positional, flagArgs := splitArgs(args)
	fs := flag.NewFlagSet("verify", flag.ContinueOnError)
	fs.SetOutput(a.Stderr)
	noSubmit := fs.Bool("no-submit", false, "run checks without sending the result")
	api := fs.String("api", "", "API base URL")
	if err := fs.Parse(flagArgs); err != nil {
		return ExitUsage
	}
	if len(positional) != 1 {
		fmt.Fprintln(a.Stderr, "Usage: fde-checker verify <level-id>")
		return ExitUsage
	}
	level, ok := Levels[positional[0]]
	if !ok {
		fmt.Fprintf(a.Stderr, "fde-checker does not know level %q. Run `fde-checker list`, or update fde-checker to the latest release.\n", positional[0])
		return ExitUsage
	}

	fmt.Fprintf(a.Stdout, "Checking %s — %s\n\n", level.ID, level.Title)
	ctx := context.Background()
	results := make([]Result, 0, len(level.Checks))
	for _, check := range level.Checks {
		passed, detail := check.Run(ctx, a.Env)
		results = append(results, Result{ID: check.ID(), Name: check.Name(), Passed: passed, Detail: detail})
	}
	allPassed := PrintTable(a.Stdout, results)

	if *noSubmit {
		fmt.Fprintln(a.Stdout, "\n--no-submit: result was not sent.")
		return exitFor(allPassed)
	}
	cfg, err := LoadConfig()
	if err != nil || cfg.Token == "" {
		fmt.Fprintln(a.Stdout, "\nNot logged in, so the result was not sent. Generate a token on the level page, then run: fde-checker login <token>")
		return exitFor(allPassed)
	}

	sub, err := BuildSubmission(cfg.Token, level.ID, a.Version, results, a.Now(), mustNonce())
	if err != nil {
		fmt.Fprintln(a.Stderr, "Could not sign the result:", err)
		return ExitSubmitError
	}
	url := a.apiURL(*api, cfg)
	resp, err := a.Poster(ctx, url, sub)
	if err != nil {
		fmt.Fprintf(a.Stderr, "\nCould not send the result to %s: %s\nYour checks still ran; try again when you are online.\n", url, err)
		return ExitSubmitError
	}
	if !resp.OK {
		fmt.Fprintf(a.Stderr, "\nThe platform rejected the result (HTTP %d): %s\n", resp.Status, resp.Error)
		return ExitSubmitError
	}
	if resp.Passed {
		fmt.Fprintln(a.Stdout, "\nResult sent. Go back to the level page and press \"Check now\".")
	} else {
		fmt.Fprintln(a.Stdout, "\nResult sent. Fix the failing checks and run verify again.")
	}
	return exitFor(allPassed)
}

func exitFor(passed bool) int {
	if passed {
		return ExitOK
	}
	return ExitChecksFail
}

func mustNonce() string {
	n, err := NewNonce()
	if err != nil {
		// crypto/rand failing means the OS is broken; a time-based fallback is still unique enough for replay checks.
		return fmt.Sprintf("%032x", time.Now().UnixNano())
	}
	return n
}

// PrintTable prints a pass/fail table and returns whether every check passed.
func PrintTable(w io.Writer, results []Result) bool {
	tw := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "RESULT\tCHECK\tDETAIL")
	passed := 0
	for _, r := range results {
		mark := "FAIL"
		if r.Passed {
			mark = "PASS"
			passed++
		}
		fmt.Fprintf(tw, "%s\t%s\t%s\n", mark, r.Name, r.Detail)
	}
	_ = tw.Flush()
	all := len(results) > 0 && passed == len(results)
	if all {
		fmt.Fprintf(w, "\nAll %d checks passed.\n", len(results))
	} else {
		fmt.Fprintf(w, "\n%d of %d checks passed.\n", passed, len(results))
	}
	return all
}

// PostSubmission POSTs the signed result to <apiURL>/checker/results.
func PostSubmission(ctx context.Context, apiURL string, sub Submission) (*SubmitResponse, error) {
	body, err := json.Marshal(sub)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL+"/checker/results", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "fde-checker")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out SubmitResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&out); err != nil {
		return nil, errors.New("unexpected response from the platform")
	}
	out.Status = resp.StatusCode
	if resp.StatusCode != http.StatusOK {
		out.OK = false
	}
	return &out, nil
}
