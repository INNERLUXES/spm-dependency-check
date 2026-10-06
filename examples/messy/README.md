# Copperleaf Orders: an app before the dependency review

A made-up coffee chain has an iOS ordering app, `CopperleafOrders.xcodeproj`, with two local packages under
`Packages/`: `OrderCore`, which holds the ordering logic and most of the dependencies, and `DesignTokens`. A new team is
taking the codebase over and reviews the dependency setup first. The setup has gone wrong in the ways such a review
finds:

- `Packages/OrderCore/Package.swift` names `imagecache` by a plain `http://` URL and with `from: "2.1.0"`, while the
  Xcode project declares the same package with up to next minor from `2.3.0`;
- `keychain-store` follows the branch `develop`, and `markdownview` is pinned to a bare revision;
- `featureflags` takes the range `"1.0.0"..<"99.0.0"`, and no Package.resolved pins it;
- `swift-retry` comes from the organization `old-tools`, which the team's list of moved packages names;
- the Package.resolved of the project pins `netkit` at 4.9.0 while both declarations ask for 5.0.0 or later, pins
  `analytics-kit` at 3.1.2 while the project asks for exactly 3.1.0, and still pins `legacy-promises`, which nothing
  declares any more;
- the app uses `OrderCore` and `OrderCore` uses `../DesignTokens` as local packages, which the report notes.

It also holds what must not be reported: two dependencies in comments of `OrderCore/Package.swift`, the pin of
`logkit`, which a dependency brings in and `../config.json` lists in `indirectPins`, a checkout under
`Packages/OrderCore/.build`, which is never read, and the folder `Vendor`, which `../config.json` leaves out with
`"exclude": ["Vendor/**"]`.

```
node bin/spm-dependency-check.js examples/messy --config examples/config.json
```

The hosts are on the reserved `.test` domain and every package is made up. The manifests and the Xcode project are
made-up input for the tool, not code of this repository.
