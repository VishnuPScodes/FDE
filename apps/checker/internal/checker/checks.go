package checker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Result is one check outcome. Field order matters: it is part of the signed payload.
type Result struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Passed bool   `json:"passed"`
	Detail string `json:"detail"`
}

// Env holds the dependencies checks use, so tests can swap them.
type Env struct {
	Runner Runner
	HTTP   HTTPGetter
}

// HTTPGetter performs a GET request. *http.Client satisfies it.
type HTTPGetter interface {
	Do(req *http.Request) (*http.Response, error)
}

// Check is one verifiable condition on the learner's machine.
type Check interface {
	ID() string
	Name() string
	Run(ctx context.Context, env Env) (passed bool, detail string)
}

func isNotFound(err error) bool {
	var ce *CommandError
	if errors.As(err, &ce) {
		low := strings.ToLower(ce.Message)
		return strings.Contains(low, "no such") || strings.Contains(low, "not found")
	}
	return false
}

// ─── Docker image ────────────────────────────────────────────────────────────

type imageInspect struct {
	Size   int64 `json:"Size"`
	Config struct {
		User        string `json:"User"`
		Healthcheck *struct {
			Test []string `json:"Test"`
		} `json:"Healthcheck"`
	} `json:"Config"`
}

func inspectImage(ctx context.Context, env Env, image string) (*imageInspect, string) {
	out, err := env.Runner.Run(ctx, "docker", "image", "inspect", image)
	if err != nil {
		if isNotFound(err) {
			return nil, fmt.Sprintf("image %s not found. Build it with: docker build -t %s .", image, image)
		}
		return nil, friendlyError("docker", err)
	}
	var images []imageInspect
	if err := json.Unmarshal(out, &images); err != nil || len(images) == 0 {
		return nil, "could not read `docker image inspect` output"
	}
	return &images[0], ""
}

// DockerImageNonRoot passes when the image's configured USER is not root.
type DockerImageNonRoot struct{ Image string }

func (c DockerImageNonRoot) ID() string { return "docker-image-non-root" }
func (c DockerImageNonRoot) Name() string {
	return fmt.Sprintf("Image %s runs as a non-root user", c.Image)
}
func (c DockerImageNonRoot) Run(ctx context.Context, env Env) (bool, string) {
	img, problem := inspectImage(ctx, env, c.Image)
	if img == nil {
		return false, problem
	}
	user := strings.TrimSpace(img.Config.User)
	if IsRootUser(user) {
		if user == "" {
			return false, "no USER instruction, so the container runs as root. Add `USER app` (after creating the user) to your Dockerfile."
		}
		return false, fmt.Sprintf("USER is %q, which is root", user)
	}
	return true, fmt.Sprintf("USER is %q", user)
}

// IsRootUser reports whether a Docker USER value means root.
func IsRootUser(user string) bool {
	if user == "" {
		return true
	}
	name := strings.SplitN(user, ":", 2)[0]
	return name == "root" || name == "0"
}

// DockerImageMaxSize passes when the image is smaller than MaxMB megabytes.
type DockerImageMaxSize struct {
	Image string
	MaxMB int64
}

func (c DockerImageMaxSize) ID() string { return "docker-image-size" }
func (c DockerImageMaxSize) Name() string {
	return fmt.Sprintf("Image %s is smaller than %d MB", c.Image, c.MaxMB)
}
func (c DockerImageMaxSize) Run(ctx context.Context, env Env) (bool, string) {
	img, problem := inspectImage(ctx, env, c.Image)
	if img == nil {
		return false, problem
	}
	mb := float64(img.Size) / 1_000_000
	detail := fmt.Sprintf("%.1f MB", mb)
	if img.Size >= c.MaxMB*1_000_000 {
		return false, detail + " — try a -slim or -alpine base and a multi-stage build"
	}
	return true, detail
}

// ─── Docker container ────────────────────────────────────────────────────────

type containerInspect struct {
	Config struct {
		Image string `json:"Image"`
	} `json:"Config"`
	State struct {
		Status  string `json:"Status"`
		Running bool   `json:"Running"`
		Health  *struct {
			Status string `json:"Status"`
		} `json:"Health"`
	} `json:"State"`
}

// DockerContainerHealthy passes when the named container is running and, when
// RequireHealthcheck is set, its HEALTHCHECK reports healthy.
type DockerContainerHealthy struct {
	Container          string
	RequireHealthcheck bool
}

func (c DockerContainerHealthy) ID() string { return "docker-container-healthy" }
func (c DockerContainerHealthy) Name() string {
	if c.RequireHealthcheck {
		return fmt.Sprintf("Container %s is running and healthy", c.Container)
	}
	return fmt.Sprintf("Container %s is running", c.Container)
}
func (c DockerContainerHealthy) Run(ctx context.Context, env Env) (bool, string) {
	out, err := env.Runner.Run(ctx, "docker", "container", "inspect", c.Container)
	if err != nil {
		if isNotFound(err) {
			return false, fmt.Sprintf("no container named %s. Start it with: docker run -d --name %s ...", c.Container, c.Container)
		}
		return false, friendlyError("docker", err)
	}
	var containers []containerInspect
	if err := json.Unmarshal(out, &containers); err != nil || len(containers) == 0 {
		return false, "could not read `docker container inspect` output"
	}
	st := containers[0].State
	if !st.Running {
		return false, fmt.Sprintf("container status is %q. Check `docker logs %s`", st.Status, c.Container)
	}
	if !c.RequireHealthcheck {
		return true, "running"
	}
	if st.Health == nil {
		return false, "running, but the image has no HEALTHCHECK"
	}
	if st.Health.Status != "healthy" {
		return false, fmt.Sprintf("health is %q (wait a few seconds after start, then run verify again)", st.Health.Status)
	}
	return true, "running, healthy"
}

// ─── Kubernetes ──────────────────────────────────────────────────────────────

type deployment struct {
	Spec struct {
		Replicas *int32 `json:"replicas"`
	} `json:"spec"`
	Status struct {
		ReadyReplicas     int32 `json:"readyReplicas"`
		AvailableReplicas int32 `json:"availableReplicas"`
	} `json:"status"`
}

// K8sDeploymentReady passes when the deployment has at least MinReplicas ready
// replicas and every desired replica is ready.
type K8sDeploymentReady struct {
	Deployment  string
	Namespace   string
	MinReplicas int32
}

func (c K8sDeploymentReady) ID() string { return "k8s-deployment-ready" }
func (c K8sDeploymentReady) Name() string {
	return fmt.Sprintf("Deployment %s/%s has %d+ ready replicas", c.Namespace, c.Deployment, c.MinReplicas)
}
func (c K8sDeploymentReady) Run(ctx context.Context, env Env) (bool, string) {
	out, err := env.Runner.Run(ctx, "kubectl", "get", "deployment", c.Deployment, "-n", c.Namespace, "-o", "json")
	if err != nil {
		if isNotFound(err) {
			return false, fmt.Sprintf("deployment %s not found in namespace %s. Did you run kubectl apply -f deployment.yaml?", c.Deployment, c.Namespace)
		}
		return false, friendlyError("kubectl", err)
	}
	var d deployment
	if err := json.Unmarshal(out, &d); err != nil {
		return false, "could not read `kubectl get deployment -o json` output"
	}
	desired := int32(1)
	if d.Spec.Replicas != nil {
		desired = *d.Spec.Replicas
	}
	detail := fmt.Sprintf("%d/%d ready", d.Status.ReadyReplicas, desired)
	if desired < c.MinReplicas {
		return false, fmt.Sprintf("%s — spec.replicas is %d, needs at least %d", detail, desired, c.MinReplicas)
	}
	if d.Status.ReadyReplicas < desired {
		return false, detail + " — check `kubectl get pods` and `kubectl describe pod`"
	}
	return true, detail
}

// ─── Local HTTP ──────────────────────────────────────────────────────────────

// LocalHTTP passes when a localhost URL answers with the expected status (and text).
type LocalHTTP struct {
	URL            string
	ExpectedStatus int
	Contains       string
}

func (c LocalHTTP) ID() string   { return "local-http" }
func (c LocalHTTP) Name() string { return fmt.Sprintf("%s returns HTTP %d", c.URL, c.ExpectedStatus) }
func (c LocalHTTP) Run(ctx context.Context, env Env) (bool, string) {
	if err := RequireLocalURL(c.URL); err != nil {
		return false, err.Error()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.URL, nil)
	if err != nil {
		return false, err.Error()
	}
	resp, err := env.HTTP.Do(req)
	if err != nil {
		return false, fmt.Sprintf("could not connect (%s). Is the container running with the port published (-p)?", shortNetErr(err))
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode != c.ExpectedStatus {
		return false, fmt.Sprintf("got HTTP %d", resp.StatusCode)
	}
	if c.Contains != "" && !strings.Contains(string(body), c.Contains) {
		return false, fmt.Sprintf("HTTP %d, but the body does not contain %q", resp.StatusCode, c.Contains)
	}
	return true, fmt.Sprintf("HTTP %d", resp.StatusCode)
}

// RequireLocalURL keeps the checker read-only and local: only loopback hosts.
func RequireLocalURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return fmt.Errorf("invalid local URL %q", raw)
	}
	host := u.Hostname()
	if host == "localhost" {
		return nil
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		return nil
	}
	return fmt.Errorf("only localhost URLs can be checked locally, got %q", host)
}

func shortNetErr(err error) string {
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		return opErr.Err.Error()
	}
	return firstLine(err.Error())
}

// NewHTTPClient returns a client that never follows redirects off the machine.
func NewHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 5 * time.Second,
		CheckRedirect: func(req *http.Request, _ []*http.Request) error {
			if err := RequireLocalURL(req.URL.String()); err != nil {
				return err
			}
			return nil
		},
	}
}
