# All regions, provinces, cities, and barangays in the Philippines in JSON and SQL format.

Scrapes https://www.philatlas.com/regions.html and compiles all regions, provinces, cities, and barangays into JSON and SQL format. This is useful to allow your users to select `region > province > city > barangay`.

## Notes

- NCR is currently the only region in the Philippines that does not have provinces and instead has cities directly.
- ID uses [CUID](https://github.com/paralleldrive/cuid2)
- Currently does not handle updates and always assumes insert, as such it always generates a new ID for each run.

# Run me

1. Git clone
2. `pnpm i`
3. `pnpm start`

The JSON and SQL outputs will be put in `/outputs` folder.
