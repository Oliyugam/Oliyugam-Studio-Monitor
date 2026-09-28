# Oliyugam Studio Monitor Adobe connectors

These source bundles are local UXP panels for Adobe Premiere Pro, Adobe Photoshop, and Adobe InDesign. They report only a product identifier and an operational state to Studio Monitor's loopback endpoint. They do not transmit document names, project names, file paths, image content, or user content.

## Development installation

1. Start Oliyugam Studio Monitor and add the relevant Adobe application from **Selected software**.
2. Open **Adobe connector setup** in Studio Monitor and copy the local endpoint and connector token.
3. Load one connector directory with Adobe UXP Developer Tool, open its panel, and paste the endpoint and token.
4. Verify the connector status in Studio Monitor while performing a supported operation.

Each source bundle must be packaged, signed, and tested against the installed Adobe version before distribution. The manifest IDs in these development bundles must be replaced with organization-owned Adobe Developer Console IDs for production distribution.

## Product support

- Premiere Pro: Adobe Media Encoder queue/render events.
- Photoshop: action activity and export notifications.
- InDesign: document lifecycle and export-related event notifications.
- Cloud-based Lightroom desktop: no local UXP/plugin connector is included. Its public cloud API is not a desktop activity API and has reached end-of-life, so Studio Monitor records only selected-app foreground usage for Lightroom.
