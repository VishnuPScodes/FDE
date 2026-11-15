package checker

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fakeRunner returns canned output keyed by "name arg1 arg2 ...".
type fakeRunner struct {
	outputs map[string]string
	errs    map[string]error
	calls   []string
}

func (f *fakeRunner) Run(_ context.Context, name string, args ...string) ([]byte, error) {
	key := strings.Join(append([]string{name}, args...), " ")
	f.calls = append(f.calls, key)
	if err, ok := f.errs[key]; ok {
		return nil, err
	}
	if err, ok := f.errs[name]; ok {
		return nil, err
	}
	if out, ok := f.outputs[key]; ok {
		return []byte(out), nil
	}
	return nil, &CommandError{Name: name, Message: "Error: No such object"}
}

const goodImage = `[{"Size": 148000000, "Config": {"User": "app"}}]`
const rootImage = `[{"Size": 912000000, "Config": {"User": ""}}]`
const healthyContainer = `[{"State": {"Status": "running", "Running": true, "Health": {"Status": "healthy"}}}]`

func TestIsRootUser(t *testing.T) {
	cases := map[string]bool{"": true, "root": true, "0": true, "0:0": true, "root:app": true, "app": false, "1000": false, "1000:1000": false, "nobody": false}
	for user, want := range cases {
		if got := IsRootUser(user); got != want {
			t.Errorf("IsRootUser(%q) = %v, want %v", user, got, want)
		}
	}
}

func TestDockerImageChecks(t *testing.T) {
	r := &fakeRunner{outputs: map[string]string{
		"docker image inspect good:1": goodImage,
		"docker image inspect root:1": rootImage,
	}}
	env := Env{Runner: r}
	ctx := context.Background()

	if ok, d := (DockerImageNonRoot{Image: "good:1"}).Run(ctx, env); !ok {
		t.Errorf("non-root good image failed: %s", d)
	}
	if ok, d := (DockerImageNonRoot{Image: "root:1"}).Run(ctx, env); ok || !strings.Contains(d, "USER") {
		t.Errorf("root image passed or bad detail: %v %s", ok, d)
	}
	if ok, d := (DockerImageMaxSize{Image: "good:1", MaxMB: 250}).Run(ctx, env); !ok || d != "148.0 MB" {
		t.Errorf("size check: %v %s", ok, d)
	}
	if ok, _ := (DockerImageMaxSize{Image: "root:1", MaxMB: 250}).Run(ctx, env); ok {
		t.Error("912 MB image should fail a 250 MB limit")
	}
	if ok, d := (DockerImageNonRoot{Image: "missing:1"}).Run(ctx, env); ok || !strings.Contains(d, "docker build") {
		t.Errorf("missing image: %v %s", ok, d)
	}
}

func TestDockerMissingOrDaemonDown(t *testing.T) {
	ctx := context.Background()
	missing := &fakeRunner{errs: map[string]error{"docker": fmt.Errorf("docker: %w", ErrToolMissing)}}
	ok, d := (DockerImageNonRoot{Image: "x"}).Run(ctx, Env{Runner: missing})
	if ok || !strings.Contains(d, "not installed") {
		t.Errorf("missing docker: %v %s", ok, d)
	}
	down := &fakeRunner{errs: map[string]error{"docker": &CommandError{Name: "docker", Message: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?"}}}
	ok, d = (DockerContainerHealthy{Container: "x"}).Run(ctx, Env{Runner: down})
	if ok || !strings.Contains(d, "daemon is not running") {
		t.Errorf("daemon down: %v %s", ok, d)
	}
}

func TestContainerHealth(t *testing.T) {
	ctx := context.Background()
	r := &fakeRunner{outputs: map[string]string{
		"docker container inspect web":      healthyContainer,
		"docker container inspect starting": `[{"State": {"Status": "running", "Running": true, "Health": {"Status": "starting"}}}]`,
		"docker container inspect nohc":     `[{"State": {"Status": "running", "Running": true}}]`,
		"docker container inspect dead":     `[{"State": {"Status": "exited", "Running": false}}]`,
	}}
	env := Env{Runner: r}
	cases := []struct {
		name string
		want bool
		frag string
	}{
		{"web", true, "healthy"},
		{"starting", false, "starting"},
		{"nohc", false, "HEALTHCHECK"},
		{"dead", false, "exited"},
		{"ghost", false, "no container"},
	}
	for _, tc := range cases {
		ok, d := (DockerContainerHealthy{Container: tc.name, RequireHealthcheck: true}).Run(ctx, env)
		if ok != tc.want || !strings.Contains(d, tc.frag) {
			t.Errorf("%s: got %v %q", tc.name, ok, d)
		}
	}
}

func TestK8sDeploymentReady(t *testing.T) {
	ctx := context.Background()
	r := &fakeRunner{outputs: map[string]string{
		"kubectl get deployment ready -n default -o json":   `{"spec":{"replicas":2},"status":{"readyReplicas":2}}`,
		"kubectl get deployment partial -n default -o json": `{"spec":{"replicas":3},"status":{"readyReplicas":1}}`,
		"kubectl get deployment single -n default -o json":  `{"spec":{"replicas":1},"status":{"readyReplicas":1}}`,
	}}
	env := Env{Runner: r}
	if ok, d := (K8sDeploymentReady{Deployment: "ready", Namespace: "default", MinReplicas: 2}).Run(ctx, env); !ok || d != "2/2 ready" {
		t.Errorf("ready: %v %s", ok, d)
	}
	if ok, _ := (K8sDeploymentReady{Deployment: "partial", Namespace: "default", MinReplicas: 2}).Run(ctx, env); ok {
		t.Error("partial should fail")
	}
	if ok, d := (K8sDeploymentReady{Deployment: "single", Namespace: "default", MinReplicas: 2}).Run(ctx, env); ok || !strings.Contains(d, "at least 2") {
		t.Errorf("single: %v %s", ok, d)
	}
	missing := &fakeRunner{errs: map[string]error{"kubectl": fmt.Errorf("kubectl: %w", ErrToolMissing)}}
	if ok, d := (K8sDeploymentReady{Deployment: "x", Namespace: "default", MinReplicas: 1}).Run(ctx, Env{Runner: missing}); ok || !strings.Contains(d, "kubectl is not installed") {
		t.Errorf("missing kubectl: %v %s", ok, d)
	}
}

func TestLocalHTTP(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			_, _ = w.Write([]byte(`{"status":"ok"}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	env := Env{HTTP: NewHTTPClient()}
	ctx := context.Background()
	if ok, d := (LocalHTTP{URL: srv.URL + "/health", ExpectedStatus: 200, Contains: "ok"}).Run(ctx, env); !ok {
		t.Errorf("health: %s", d)
	}
	if ok, _ := (LocalHTTP{URL: srv.URL + "/nope", ExpectedStatus: 200}).Run(ctx, env); ok {
		t.Error("404 should fail")
	}
	if ok, d := (LocalHTTP{URL: "http://example.com/", ExpectedStatus: 200}).Run(ctx, env); ok || !strings.Contains(d, "only localhost") {
		t.Errorf("remote URL must be refused: %v %s", ok, d)
	}
}

func TestRealExecRunnerMissingTool(t *testing.T) {
	_, err := ExecRunner{}.Run(context.Background(), "definitely-not-a-real-binary-fde")
	if !errors.Is(err, ErrToolMissing) {
		t.Fatalf("want ErrToolMissing, got %v", err)
	}
}

// Same vector as apps/api/src/test/realworld-routes.test.ts (computed with Python hmac).
func TestKnownVector(t *testing.T) {
	if got := Sign("fdec_test", `{"hello":"world"}`); got != "f4c85933f438ef8adce8b1f6c6a019eb7f73e432aa5ccf8d242277939b78fca5" {
		t.Fatalf("signature mismatch: %s", got)
	}
	if got := TokenID("fdec_test"); got != "53074ad81f324ebaeeadd9cdc75cd21cd8464cef89aa44ef6d342ef8f17a2d52" {
		t.Fatalf("token id mismatch: %s", got)
	}
}

func TestBuildSubmission(t *testing.T) {
	token := "fdec_" + strings.Repeat("A", 43)
	now := time.Unix(1_800_000_000, 0)
	sub, err := BuildSubmission(token, "p2-w07-real-001", "v0.1.0", []Result{{ID: "a", Name: "A <check>", Passed: true, Detail: strings.Repeat("x", 2000)}}, now, strings.Repeat("ab", 16))
	if err != nil {
		t.Fatal(err)
	}
	var p Payload
	if err := json.Unmarshal([]byte(sub.Payload), &p); err != nil {
		t.Fatal(err)
	}
	if p.LevelID != "p2-w07-real-001" || p.Timestamp != now.Unix() || p.TokenID != sub.TokenID || len(p.Results[0].Detail) != 1000 {
		t.Fatalf("unexpected payload: %+v", p)
	}
	key := hmac.New(sha256.New, []byte(token))
	key.Write([]byte(SigningContext))
	mac := hmac.New(sha256.New, key.Sum(nil))
	mac.Write([]byte(sub.Payload))
	if hex.EncodeToString(mac.Sum(nil)) != sub.Signature {
		t.Fatal("signature does not verify")
	}
}

func newTestApp(t *testing.T, r Runner) (*App, *bytes.Buffer, *bytes.Buffer, *[]Submission) {
	t.Helper()
	t.Setenv("FDE_CHECKER_HOME", t.TempDir())
	var out, errOut bytes.Buffer
	var sent []Submission
	app := &App{
		Version:       "test",
		DefaultAPIURL: "http://api.test",
		Stdout:        &out,
		Stderr:        &errOut,
		Env:           Env{Runner: r, HTTP: NewHTTPClient()},
		Now:           time.Now,
		Getenv:        func(string) string { return "" },
		Poster: func(_ context.Context, url string, sub Submission) (*SubmitResponse, error) {
			if url != "http://api.test" {
				t.Errorf("unexpected API url %s", url)
			}
			sent = append(sent, sub)
			return &SubmitResponse{OK: true, Passed: true, Status: 200}, nil
		},
	}
	return app, &out, &errOut, &sent
}

func TestLoginAndVerifyKind(t *testing.T) {
	r := &fakeRunner{outputs: map[string]string{
		"kubectl get deployment clinic-api -n default -o json": `{"spec":{"replicas":2},"status":{"readyReplicas":2}}`,
	}}
	app, out, errOut, sent := newTestApp(t, r)
	token := "fdec_" + strings.Repeat("b", 43)
	if code := app.Run([]string{"login", token}); code != ExitOK {
		t.Fatalf("login failed: %s", errOut)
	}
	info, err := os.Stat(filepath.Join(os.Getenv("FDE_CHECKER_HOME"), "config.json"))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("config not saved with 0600: %v %v", err, info)
	}
	if code := app.Run([]string{"verify", "p2-w08-real-001"}); code != ExitOK {
		t.Fatalf("verify exit %d: %s %s", code, out, errOut)
	}
	if !strings.Contains(out.String(), "PASS") || len(*sent) != 1 || (*sent)[0].TokenID != TokenID(token) {
		t.Fatalf("unexpected output/submission: %s %+v", out, *sent)
	}
}

func TestVerifyFailingAndNoSubmit(t *testing.T) {
	app, out, _, sent := newTestApp(t, &fakeRunner{})
	if code := app.Run([]string{"verify", "p2-w07-real-001", "--no-submit"}); code != ExitChecksFail {
		t.Fatalf("want exit 1, got %d", code)
	}
	if !strings.Contains(out.String(), "FAIL") || !strings.Contains(out.String(), "0 of 4 checks passed") || len(*sent) != 0 {
		t.Fatalf("unexpected: %s", out)
	}
}

func TestVerifyWithoutLogin(t *testing.T) {
	app, out, _, sent := newTestApp(t, &fakeRunner{})
	app.Run([]string{"verify", "p2-w08-real-001"})
	if !strings.Contains(out.String(), "Not logged in") || len(*sent) != 0 {
		t.Fatalf("unexpected: %s", out)
	}
}

func TestUsageErrors(t *testing.T) {
	app, _, errOut, _ := newTestApp(t, &fakeRunner{})
	if code := app.Run([]string{"login", "not-a-token"}); code != ExitUsage {
		t.Fatalf("bad token should be rejected, got %d", code)
	}
	if code := app.Run([]string{"verify", "p9-w99-nope-001"}); code != ExitUsage || !strings.Contains(errOut.String(), "does not know") {
		t.Fatalf("unknown level: %d %s", code, errOut)
	}
	if code := app.Run([]string{"bogus"}); code != ExitUsage {
		t.Fatal("unknown command should fail")
	}
}

func TestPostSubmissionAgainstServer(t *testing.T) {
	var got Submission
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/checker/results" || r.Method != http.MethodPost {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		if got.Signature == "" {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"Signature does not match."}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true,"passed":true}`))
	}))
	defer srv.Close()
	resp, err := PostSubmission(context.Background(), srv.URL, Submission{TokenID: "t", Payload: "{}", Signature: "s"})
	if err != nil || !resp.OK || !resp.Passed {
		t.Fatalf("post: %v %+v", err, resp)
	}
	resp, err = PostSubmission(context.Background(), srv.URL, Submission{TokenID: "t", Payload: "{}"})
	if err != nil || resp.OK || resp.Status != 401 || !strings.Contains(resp.Error, "Signature") {
		t.Fatalf("rejection: %v %+v", err, resp)
	}
}
