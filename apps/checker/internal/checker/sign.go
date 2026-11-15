package checker

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"regexp"
	"time"
)

// SigningContext must match apps/api/src/lib/checker-crypto.ts.
const SigningContext = "fde-checker-signing-v1"

// TokenPattern matches tokens issued by POST /checker/token.
var TokenPattern = regexp.MustCompile(`^fdec_[A-Za-z0-9_-]{43}$`)

// TokenID is hex(SHA-256(token)); the server stores only this.
func TokenID(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// SigningKey is HMAC-SHA256(key = token, SigningContext).
func SigningKey(token string) []byte {
	mac := hmac.New(sha256.New, []byte(token))
	mac.Write([]byte(SigningContext))
	return mac.Sum(nil)
}

// Sign returns hex(HMAC-SHA256(SigningKey(token), payload)).
func Sign(token, payload string) string {
	mac := hmac.New(sha256.New, SigningKey(token))
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

// Payload is the signed body. Its JSON string is sent verbatim and verified byte-for-byte.
type Payload struct {
	V              int      `json:"v"`
	LevelID        string   `json:"level_id"`
	TokenID        string   `json:"token_id"`
	Timestamp      int64    `json:"timestamp"`
	Nonce          string   `json:"nonce"`
	CheckerVersion string   `json:"checker_version"`
	Results        []Result `json:"results"`
}

// Submission is what POST /checker/results receives.
type Submission struct {
	TokenID   string `json:"token_id"`
	Payload   string `json:"payload"`
	Signature string `json:"signature"`
}

// NewNonce returns 16 random bytes as hex.
func NewNonce() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// BuildSubmission signs level id + token id + timestamp + nonce + results with the learner's token.
func BuildSubmission(token, levelID, version string, results []Result, now time.Time, nonce string) (Submission, error) {
	clean := make([]Result, len(results))
	for i, r := range results {
		clean[i] = Result{ID: truncate(r.ID, 80), Name: truncate(r.Name, 200), Passed: r.Passed, Detail: truncate(r.Detail, 1000)}
	}
	p := Payload{
		V:              1,
		LevelID:        levelID,
		TokenID:        TokenID(token),
		Timestamp:      now.Unix(),
		Nonce:          nonce,
		CheckerVersion: truncate(version, 40),
		Results:        clean,
	}
	raw, err := json.Marshal(p)
	if err != nil {
		return Submission{}, err
	}
	payload := string(raw)
	return Submission{TokenID: p.TokenID, Payload: payload, Signature: Sign(token, payload)}, nil
}

func truncate(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
