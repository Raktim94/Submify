package main

import (
	"log"

	"github.com/nodedr/submify/apps/api/internal/app"
	// Embeds the IANA timezone database into the binary — the production
	// alpine:3.20 image (see Dockerfile) doesn't install the tzdata
	// package, so time.LoadLocation for any non-UTC zone would otherwise
	// fail at runtime despite working in local dev. See
	// docs/decisions/0005-calendar-booking-architecture.md.
	_ "time/tzdata"
)

func main() {
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
