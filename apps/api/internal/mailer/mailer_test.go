package mailer

import (
	"encoding/base64"
	"strings"
	"testing"
)

// TestBuildMessage_HeaderInjection_SubjectCannotSmuggleHeaders proves the
// fix for the email-header-injection finding (CodeQL go/email-injection):
// a subject containing an embedded CRLF must not be able to terminate the
// Subject header early and inject an attacker-chosen header line (e.g. a
// hidden Bcc) into the constructed message.
func TestBuildMessage_HeaderInjection_SubjectCannotSmuggleHeaders(t *testing.T) {
	malicious := "Innocuous subject\r\nBcc: attacker@evil.example"
	msg := string(buildMessage("from@example.com", []string{"to@example.com"}, malicious, "body"))

	// "Bcc:" as plain text safely inert inside the Subject line is fine and
	// expected — what must never happen is "Bcc:" appearing as its OWN
	// header line (i.e. immediately after a "\r\n").
	for _, line := range strings.Split(msg, "\r\n") {
		if strings.HasPrefix(line, "Bcc:") {
			t.Fatalf("Bcc smuggled in as its own header line:\n%s", msg)
		}
	}
	if !strings.Contains(msg, "Subject: Innocuous subjectBcc: attacker@evil.example\r\n") {
		t.Fatalf("expected the CRLF to be stripped in place, not the subject silently truncated; got:\n%s", msg)
	}
}

// TestBuildMessage_HeaderInjection_FromAndToSanitized covers the From/To
// header lines the same way — both are user-controlled (project.Name-
// adjacent config, NotificationRecipients) and interpolated the same way
// as Subject.
func TestBuildMessage_HeaderInjection_FromAndToSanitized(t *testing.T) {
	msg := string(buildMessage(
		"from@example.com\r\nX-Injected: from",
		[]string{"to@example.com\r\nX-Injected: to"},
		"subject",
		"body",
	))
	for _, line := range strings.Split(msg, "\r\n") {
		if strings.HasPrefix(line, "X-Injected:") {
			t.Fatalf("X-Injected smuggled in as its own header line via From/To:\n%s", msg)
		}
	}
}

// TestBuildMessage_BodyPreservedThroughBase64 confirms the fix didn't
// overcorrect — body content (the submission's field data, intentionally
// verbatim per ADR 0007) must survive unmodified once decoded, including
// its own newlines. It is no longer written raw into the message (see
// TestBuildMessage_ContentInjection_BodyCannotInjectRawBytes) — it's
// base64-encoded (Content-Transfer-Encoding: base64) and decoded back to
// the original by the receiving mail client.
func TestBuildMessage_BodyPreservedThroughBase64(t *testing.T) {
	body := "line one\r\nline two\nline three"
	msg := string(buildMessage("from@example.com", []string{"to@example.com"}, "subject", body))

	if !strings.Contains(msg, "Content-Transfer-Encoding: base64\r\n") {
		t.Fatalf("expected a Content-Transfer-Encoding: base64 header; got:\n%s", msg)
	}
	parts := strings.SplitN(msg, "\r\n\r\n", 2)
	if len(parts) != 2 {
		t.Fatalf("expected a blank line separating headers from body; got:\n%s", msg)
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(parts[1], "\r\n", ""))
	if err != nil {
		t.Fatalf("body is not valid base64: %v\ngot:\n%s", err, msg)
	}
	if string(decoded) != body {
		t.Fatalf("expected decoded body to equal the original verbatim; got %q, want %q", decoded, body)
	}
}

// TestBuildMessage_ContentInjection_BodyCannotInjectRawBytes proves the
// fix for the email-content-injection finding (CodeQL go/email-injection,
// CWE-93): body is fully attacker-controlled (submission field data) and
// arbitrary-length, so writing it raw into the message would let it carry
// any byte sequence straight into what gets written to the SMTP
// connection — including lines that look like headers, or (absent Go's
// automatic dot-stuffing on the DATA writer) a bare "." line. Base64
// encoding restricts the body's on-wire bytes to a fixed safe alphabet,
// so none of that attacker content ever reaches the wire unencoded.
func TestBuildMessage_ContentInjection_BodyCannotInjectRawBytes(t *testing.T) {
	malicious := "ignore me\r\nX-Injected: header-via-body\r\n\r\nFrom: attacker@evil.example\r\n.\r\nMAIL FROM:<spoofed@evil.example>"
	msg := string(buildMessage("from@example.com", []string{"to@example.com"}, "subject", malicious))

	parts := strings.SplitN(msg, "\r\n\r\n", 2)
	if len(parts) != 2 {
		t.Fatalf("expected a blank line separating headers from body; got:\n%s", msg)
	}
	onWireBody := parts[1]
	for _, line := range strings.Split(onWireBody, "\r\n") {
		if line == "" {
			continue
		}
		for _, c := range line {
			if !strings.ContainsRune("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=", c) {
				t.Fatalf("on-wire body contains a non-base64 byte %q — attacker content reached the wire unencoded:\n%s", c, msg)
			}
		}
	}
}

// TestValidateAddresses_RejectsCRLF covers the second half of the fix: the
// hand-rolled implicit-TLS path talks to smtp.Client.Mail()/Rcpt()
// directly, which (unlike stdlib smtp.SendMail) has no built-in CRLF
// check — an unvalidated address there could inject raw SMTP protocol
// commands, not just email headers.
func TestValidateAddresses_RejectsCRLF(t *testing.T) {
	cases := []struct {
		name string
		from string
		to   []string
		want bool // true = expect an error
	}{
		{"clean addresses", "from@example.com", []string{"to@example.com"}, false},
		{"CRLF in from", "from@example.com\r\nMAIL FROM:<spoofed@evil.example>", []string{"to@example.com"}, true},
		{"CRLF in to", "from@example.com", []string{"to@example.com\r\nRCPT TO:<extra@evil.example>"}, true},
		{"bare LF in to", "from@example.com", []string{"to@example.com\nRCPT TO:<extra@evil.example>"}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := validateAddresses(c.from, c.to)
			if c.want && err == nil {
				t.Fatalf("expected an error for %q / %v, got nil", c.from, c.to)
			}
			if !c.want && err != nil {
				t.Fatalf("expected no error for %q / %v, got %v", c.from, c.to, err)
			}
		})
	}
}
