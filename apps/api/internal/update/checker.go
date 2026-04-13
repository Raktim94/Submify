package update

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Checker struct {
	Repo string
	CurrentTag  string
	GitHubToken string
	Client      *http.Client
}

type release struct {
	TagName string `json:"tag_name"`
	Draft   bool   `json:"draft"`
}

type tagRef struct {
	Name string `json:"name"`
}

func NewChecker(repo, currentTag, gitHubToken string) *Checker {
	return &Checker{
		Repo:        repo,
		CurrentTag:  currentTag,
		GitHubToken: strings.TrimSpace(gitHubToken),
		Client:      &http.Client{Timeout: 12 * time.Second},
	}
}

func (c *Checker) setHeaders(req *http.Request) {
	req.Header.Set("Accept", "application/vnd.github+json")
	// GitHub rejects or throttles requests without a descriptive User-Agent.
	req.Header.Set("User-Agent", "SubmifyUpdateChecker/1.0 (+https://github.com/nodedr/submify)")
	if c.GitHubToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.GitHubToken)
	}
}

func (c *Checker) getJSON(url string, out interface{}) (int, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	c.setHeaders(req)
	resp, err := c.Client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return resp.StatusCode, err
	}
	if resp.StatusCode >= 400 {
		return resp.StatusCode, fmt.Errorf("github api %s: status %d", url, resp.StatusCode)
	}
	if err := json.Unmarshal(body, out); err != nil {
		return resp.StatusCode, err
	}
	return resp.StatusCode, nil
}

// CheckLatest returns (updateAvailable, latestVersionTag, error).
// latestVersion is normalized without a leading "v" for display consistency.
func (c *Checker) CheckLatest() (bool, string, error) {
	repo := strings.TrimSpace(c.Repo)
	if repo == "" {
		return false, "", nil
	}

	latest, err := c.fetchLatestVersionTag()
	if err != nil {
		return false, "", err
	}
	latest = strings.TrimSpace(strings.TrimPrefix(latest, "v"))
	current := strings.TrimSpace(strings.TrimPrefix(c.CurrentTag, "v"))
	if latest == "" {
		return false, "", fmt.Errorf("no release or tag found for %s", repo)
	}
	avail := tagIsNewer(latest, current)
	return avail, latest, nil
}

func (c *Checker) fetchLatestVersionTag() (string, error) {
	repo := strings.TrimSpace(c.Repo)
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	c.setHeaders(req)
	resp, err := c.Client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode == http.StatusNotFound {
		return c.fetchLatestFromReleasesList()
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("releases/latest: status %d", resp.StatusCode)
	}
	var r release
	if err := json.Unmarshal(body, &r); err != nil {
		return "", err
	}
	if strings.TrimSpace(r.TagName) != "" {
		return r.TagName, nil
	}
	return c.fetchLatestFromReleasesList()
}

func (c *Checker) fetchLatestFromReleasesList() (string, error) {
	repo := strings.TrimSpace(c.Repo)
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=10", repo)
	var list []release
	if _, err := c.getJSON(url, &list); err != nil {
		return c.fetchLatestFromTags()
	}
	for _, r := range list {
		if r.Draft {
			continue
		}
		if t := strings.TrimSpace(r.TagName); t != "" {
			return t, nil
		}
	}
	return c.fetchLatestFromTags()
}

func (c *Checker) fetchLatestFromTags() (string, error) {
	repo := strings.TrimSpace(c.Repo)
	url := fmt.Sprintf("https://api.github.com/repos/%s/tags?per_page=1", repo)
	var list []tagRef
	if _, err := c.getJSON(url, &list); err != nil {
		return "", err
	}
	if len(list) == 0 || strings.TrimSpace(list[0].Name) == "" {
		return "", fmt.Errorf("no tags for %s", repo)
	}
	return list[0].Name, nil
}

func tagIsNewer(latest, current string) bool {
	if latest == "" {
		return false
	}
	if current == "" {
		return true
	}
	la := parseSemverParts(latest)
	cu := parseSemverParts(current)
	for i := 0; i < 3; i++ {
		if la[i] > cu[i] {
			return true
		}
		if la[i] < cu[i] {
			return false
		}
	}
	return false
}

func parseSemverParts(s string) [3]int {
	s = strings.TrimSpace(strings.TrimPrefix(s, "v"))
	var out [3]int
	parts := strings.SplitN(s, ".", 4)
	for i := 0; i < 3 && i < len(parts); i++ {
// strip pre-release suffix e.g. 1.0.0-beta
		num := parts[i]
		if j := strings.IndexFunc(num, func(r rune) bool {
			return r < '0' || r > '9'
		}); j >= 0 {
			num = num[:j]
		}
		n, _ := strconv.Atoi(num)
		out[i] = n
	}
	return out
}
