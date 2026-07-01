package httpapi

import (
	"errors"
	"regexp"
	"strings"
)

// reservedPortalSlugs can never be used as a project portal slug because the dashboard,
// docs, and API already own these top-level paths. A project with one of these slugs
// would be shadowed by a static route and be unreachable.
var reservedPortalSlugs = map[string]struct{}{
	"api": {}, "p": {}, "dashboard": {}, "projects": {}, "submissions": {}, "export": {},
	"settings": {}, "docs": {}, "login": {}, "register": {}, "setup": {}, "logout": {},
	"_next": {}, "static": {}, "public": {}, "assets": {}, "brand": {}, "favicon": {},
	"favicon.ico": {}, "robots.txt": {}, "sitemap.xml": {}, "icon": {}, "apple-icon": {},
	"portal": {}, "admin": {}, "auth": {}, "me": {}, "users": {}, "health": {},
	"thank-you": {}, "contact": {}, "privacy": {}, "terms": {}, "accessibility": {},
}

var slugCharsRe = regexp.MustCompile(`[^a-z0-9]+`)
var slugValidRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`)

const (
	minSlugLen = 2
	maxSlugLen = 40
)

// slugify converts an arbitrary project name into a candidate URL slug. It may return
// an empty string when the name has no usable characters — callers must handle that.
func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = slugCharsRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > maxSlugLen {
		s = strings.Trim(s[:maxSlugLen], "-")
	}
	return s
}

// normalizePortalSlug validates and lower-cases an owner-supplied slug, returning a
// friendly error when it is malformed or reserved.
func normalizePortalSlug(raw string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return "", errors.New("portal slug cannot be empty")
	}
	if len(s) < minSlugLen || len(s) > maxSlugLen {
		return "", errors.New("portal slug must be between 2 and 40 characters")
	}
	if !slugValidRe.MatchString(s) {
		return "", errors.New("portal slug may only contain lowercase letters, numbers, and hyphens (no leading/trailing hyphen)")
	}
	if _, reserved := reservedPortalSlugs[s]; reserved {
		return "", errors.New("that portal slug is reserved; choose another")
	}
	return s, nil
}
