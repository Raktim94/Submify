package update

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type Checker struct {
	Repo       string
	CurrentTag string
	Client     *http.Client
}

type release struct {
	TagName string `json:"tag_name"`
}

func NewChecker(repo, currentTag string) *Checker {
	return &Checker{
		Repo:       repo,
		CurrentTag: currentTag,
		Client:     &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *Checker) CheckLatest() (bool, string, error) {
	if c.Repo == "" {
		return false, "", nil
	}
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", c.Repo)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return false, "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := c.Client.Do(req)
	if err != nil {
		return false, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return false, "", fmt.Errorf("release check status: %d", resp.StatusCode)
	}

	var r release
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return false, "", err
	}
	latest := strings.TrimPrefix(r.TagName, "v")
	current := strings.TrimPrefix(c.CurrentTag, "v")
	return latest != "" && latest != current, latest, nil
}
