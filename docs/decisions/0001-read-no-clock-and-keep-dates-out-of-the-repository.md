# 1. Read no clock, and keep dates out of the repository

## Status

Accepted

## Context

A review of dependencies tempts a tool to look at the calendar and the network: how old a pinned version is, whether a
newer tag came out last month, how long a branch has gone without a commit, when a repository moved to another
organization. Each of these would make the same files give a different result on a different day, so a pipeline that
passed yesterday could fail today with no change to the repository, and two people reading the same commit could see
two reports. The output could never be saved and compared.

The checks do not need a date. Whether a requirement follows a branch, whether a pin is inside its requirement, whether
a package is declared twice, whether Package.resolved is there: all of it can be read from the files as they are.

## Decision

1. The tool reads no clock, no time zone and no locale. It never prints the current time and never says how old a
   version is or what the latest version is. The same files and configuration give the same output on every machine
   and on every day.
2. The tool fetches nothing, so no version is looked up ([decision 3](0003-check-the-files-on-disk-and-fetch-nothing.md)).
3. No file of this repository holds a date or a number that reads like a year: not the licence, not the changelog, not
   the documents, not the comments of the code, not the tests, not the examples. `npm run check` and a test fail on any
   word of four digits that starts with 19 or 20. The examples hold no date at all, and their versions, object ids and
   commits are chosen so that none of them reads like a year.
4. A package version is not a year and is not caught: 5.0.0, 2.3.4 and 1.0.0..<99.0.0 hold no word of four digits,
   and an object id of an Xcode project or a commit is one long word. A test of test/repo.test.js runs the pattern over
   such values and checks that none of them is caught, and that a year in the same place still is; the pattern is the
   same in the tests and in tools/check.mjs.

## Consequences

- The output of a run can be saved in the repository (`examples/output`) and compared on every change, because it does
  not move with the calendar.
- An old version is not reported as old; docs/limits.md says so, and a team that wants that keeps a separate update
  tool for it.
- The limits of the tool are chosen so that none of them reads like a year, and a check catches one that does.
