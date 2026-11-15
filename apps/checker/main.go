// Command fde-checker verifies real-world FDE platform levels on the learner's
// own machine (real Docker, real Kubernetes, local HTTP services) and sends a
// signed result to the platform API. It is read-only: it never changes
// anything on the machine.
package main

import (
	"os"

	"github.com/fde-platform/checker/internal/checker"
)

// Set at build time: -ldflags "-X main.version=v0.1.0 -X main.defaultAPIURL=https://..."
var (
	version       = "dev"
	defaultAPIURL = "http://localhost:8787"
)

func main() {
	app := checker.NewApp(version, defaultAPIURL)
	os.Exit(app.Run(os.Args[1:]))
}
