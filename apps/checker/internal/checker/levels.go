package checker

import "sort"

// Level is a real-world level the checker knows how to verify.
type Level struct {
	ID     string
	Title  string
	Checks []Check
}

// Levels is the embedded check table, keyed by level id. Keep it in sync with
// content/phases/**/levels/<id>/level.yaml (checks of kind checker_token).
var Levels = map[string]Level{
	"p2-w07-real-001": {
		ID:    "p2-w07-real-001",
		Title: "Run the clinic API image on your real Docker",
		Checks: []Check{
			DockerImageNonRoot{Image: "fde-clinic-api:local"},
			DockerImageMaxSize{Image: "fde-clinic-api:local", MaxMB: 250},
			DockerContainerHealthy{Container: "fde-clinic-api", RequireHealthcheck: true},
			LocalHTTP{URL: "http://localhost:8080/health", ExpectedStatus: 200, Contains: "ok"},
		},
	},
	"p2-w08-real-001": {
		ID:    "p2-w08-real-001",
		Title: "Run the clinic API on a real kind cluster",
		Checks: []Check{
			K8sDeploymentReady{Deployment: "clinic-api", Namespace: "default", MinReplicas: 2},
		},
	},
}

// LevelIDs returns the supported level ids in sorted order.
func LevelIDs() []string {
	ids := make([]string, 0, len(Levels))
	for id := range Levels {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
