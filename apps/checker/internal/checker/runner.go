package checker

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// CommandTimeout bounds every external command the checker runs.
const CommandTimeout = 20 * time.Second

// ErrToolMissing means the binary (docker, kubectl) is not installed or not on PATH.
var ErrToolMissing = errors.New("tool not found on PATH")

// Runner runs an external command and returns its stdout. It is an interface
// so tests can replace real docker/kubectl calls with canned output.
type Runner interface {
	Run(ctx context.Context, name string, args ...string) (stdout []byte, err error)
}

// ExecRunner shells out with os/exec and a timeout.
type ExecRunner struct {
	Timeout time.Duration
}

// Run implements Runner.
func (r ExecRunner) Run(ctx context.Context, name string, args ...string) ([]byte, error) {
	if _, err := exec.LookPath(name); err != nil {
		return nil, fmt.Errorf("%s: %w", name, ErrToolMissing)
	}
	timeout := r.Timeout
	if timeout == 0 {
		timeout = CommandTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return nil, fmt.Errorf("%s %s timed out after %s", name, strings.Join(args, " "), timeout)
	}
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return stdout.Bytes(), &CommandError{Name: name, Message: msg}
	}
	return stdout.Bytes(), nil
}

// CommandError carries a failed command's stderr in a readable form.
type CommandError struct {
	Name    string
	Message string
}

func (e *CommandError) Error() string {
	return fmt.Sprintf("%s failed: %s", e.Name, firstLine(e.Message))
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

// friendlyError turns runner errors into short learner-facing explanations.
func friendlyError(tool string, err error) string {
	switch {
	case errors.Is(err, ErrToolMissing):
		switch tool {
		case "docker":
			return "docker is not installed or not on PATH. Install Docker Engine, Docker Desktop or Podman (alias docker=podman) and try again."
		case "kubectl":
			return "kubectl is not installed or not on PATH. Install kubectl and create a cluster with kind, then try again."
		}
		return tool + " is not installed or not on PATH."
	default:
		msg := err.Error()
		low := strings.ToLower(msg)
		if tool == "docker" && (strings.Contains(low, "cannot connect to the docker daemon") || strings.Contains(low, "is the docker daemon running") || strings.Contains(low, "error during connect")) {
			return "Docker is installed but the daemon is not running. Start Docker Desktop (or `sudo systemctl start docker`) and try again."
		}
		if tool == "kubectl" && (strings.Contains(low, "connection refused") || strings.Contains(low, "unable to connect to the server") || strings.Contains(low, "no configuration")) {
			return "kubectl cannot reach a cluster. Run `kind create cluster` (or start minikube/k3d) and check `kubectl config current-context`."
		}
		return msg
	}
}
