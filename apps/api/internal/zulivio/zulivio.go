// Package zulivio pushes a Submify form submission into Zulivio as a lead,
// using Zulivio's own existing POST /api/v1/leads endpoint and personal
// API-key auth — see docs/decisions/0006-zulivio-integration-via-existing-api-key.md
// for why this doesn't require any change on the Zulivio side.
package zulivio

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

type leadPayload struct {
	FullName   string `json:"fullName"`
	Email      string `json:"email,omitempty"`
	Phone      string `json:"phone,omitempty"`
	Company    string `json:"company,omitempty"`
	Source     string `json:"source,omitempty"`
	Notes      string `json:"notes,omitempty"`
	AutoAssign bool   `json:"autoAssign"`
}

// nameKeys/emailKeys/etc. are matched case-insensitively against a
// submission's top-level data keys — see the ADR for why this heuristic
// exists instead of a configurable field-mapping UI.
var (
	nameKeys    = []string{"name", "full_name", "fullname", "your_name", "your name"}
	emailKeys   = []string{"email", "email_address", "your_email"}
	phoneKeys   = []string{"phone", "phone_number", "mobile", "telephone"}
	companyKeys = []string{"company", "organization", "organisation", "business"}
)

func firstMatch(data map[string]any, keys []string) string {
	// Build a lowercased lookup once so this stays O(keys) not O(keys*data).
	lower := make(map[string]any, len(data))
	for k, v := range data {
		lower[strings.ToLower(strings.TrimSpace(k))] = v
	}
	for _, k := range keys {
		if v, ok := lower[k]; ok {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}

// BuildLeadFromSubmission maps a submission's data object to a Zulivio
// lead, folding every unmapped field into Notes so nothing is silently
// dropped. Returns ok=false if no usable name was found (Zulivio requires
// fullName) — the caller should skip pushing in that case rather than
// sending a request Zulivio will reject.
func BuildLeadFromSubmission(projectName string, data map[string]any) (payload []byte, ok bool) {
	name := firstMatch(data, nameKeys)
	if name == "" {
		return nil, false
	}
	lead := leadPayload{
		FullName:   name,
		Email:      firstMatch(data, emailKeys),
		Phone:      firstMatch(data, phoneKeys),
		Company:    firstMatch(data, companyKeys),
		Source:     "Submify: " + projectName,
		AutoAssign: true,
	}
	lead.Notes = remainderAsNotes(data, lead)
	b, err := json.Marshal(lead)
	if err != nil {
		return nil, false
	}
	return b, true
}

func remainderAsNotes(data map[string]any, lead leadPayload) string {
	mapped := map[string]bool{}
	for _, k := range append(append(append([]string{}, nameKeys...), emailKeys...), append(phoneKeys, companyKeys...)...) {
		mapped[k] = true
	}
	remainder := map[string]any{}
	for k, v := range data {
		if !mapped[strings.ToLower(strings.TrimSpace(k))] {
			remainder[k] = v
		}
	}
	if len(remainder) == 0 {
		return ""
	}
	b, err := json.MarshalIndent(remainder, "", "  ")
	if err != nil {
		return ""
	}
	return "Other submitted fields:\n" + string(b)
}

// PushAsync sends the lead to apiURL's /api/v1/leads with 3 retries,
// fire-and-forget — a Zulivio outage never affects the submission response,
// same pattern as internal/telegram.NotifyAsync.
func PushAsync(apiURL, apiKey string, leadJSON []byte) {
	apiURL = strings.TrimRight(strings.TrimSpace(apiURL), "/")
	apiKey = strings.TrimSpace(apiKey)
	if apiURL == "" || apiKey == "" {
		return
	}
	go func() {
		for i := 0; i < 3; i++ {
			err := send(apiURL, apiKey, leadJSON)
			if err == nil {
				return
			}
			log.Printf("zulivio lead push failed (attempt=%d): %v", i+1, err)
			time.Sleep(time.Duration(i+1) * 2 * time.Second)
		}
	}()
}

func send(apiURL, apiKey string, leadJSON []byte) error {
	req, err := http.NewRequest(http.MethodPost, apiURL+"/api/v1/leads", bytes.NewReader(leadJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("zulivio status=%d body=%s", resp.StatusCode, string(body))
	}
	return nil
}
