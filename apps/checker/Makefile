# fde-checker build. Static, CGO-free binaries for every platform learners use.
#   make test            run vet + unit tests
#   make build           build for this machine into ./bin
#   make dist VERSION=v0.1.0 API_URL=https://fde-api.<account>.workers.dev
#                        cross-compile all targets into ./dist (+ SHA256SUMS)

VERSION ?= dev
API_URL ?= http://localhost:8787
DIST ?= dist
LDFLAGS := -s -w -X main.version=$(VERSION) -X main.defaultAPIURL=$(API_URL)
TARGETS := linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64

.PHONY: test build dist clean

test:
	go vet ./...
	go test ./...

build:
	CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/fde-checker .

dist:
	@mkdir -p $(DIST)
	@for target in $(TARGETS); do \
		os=$${target%/*}; arch=$${target#*/}; ext=""; \
		if [ "$$os" = "windows" ]; then ext=".exe"; fi; \
		out="$(DIST)/fde-checker-$(VERSION)-$$os-$$arch$$ext"; \
		echo "building $$out"; \
		CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch go build -trimpath -ldflags "$(LDFLAGS)" -o "$$out" . || exit 1; \
	done
	@cd $(DIST) && (command -v sha256sum >/dev/null && sha256sum fde-checker-* || shasum -a 256 fde-checker-*) > SHA256SUMS
	@echo "done: $(DIST)/"

clean:
	rm -rf bin dist
