package checker

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// Config is stored at <user config dir>/fde-checker/config.json with 0600 permissions.
type Config struct {
	Token  string `json:"token"`
	APIURL string `json:"api_url,omitempty"`
}

// ConfigDir honours FDE_CHECKER_HOME, then the OS user config directory.
func ConfigDir() (string, error) {
	if dir := os.Getenv("FDE_CHECKER_HOME"); dir != "" {
		return dir, nil
	}
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "fde-checker"), nil
}

func configPath() (string, error) {
	dir, err := ConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

// LoadConfig returns an empty config when none exists yet.
func LoadConfig() (Config, error) {
	path, err := configPath()
	if err != nil {
		return Config{}, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return Config{}, nil
	}
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, errors.New("config file is damaged; run `fde-checker login <token>` again")
	}
	return cfg, nil
}

// SaveConfig writes the config readable only by the current user.
func SaveConfig(cfg Config) (string, error) {
	path, err := configPath()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return "", err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return "", err
	}
	return path, os.Rename(tmp, path)
}

// DeleteConfig removes the stored token.
func DeleteConfig() error {
	path, err := configPath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
