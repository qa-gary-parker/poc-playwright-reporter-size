# poc-playwright-reporter-size

Measures what the `onlyFailures` reporter option and the `failures` reporter in Playwright 1.65 keep, drop and save.

## TLDR

- `onlyFailures` keeps tests that failed, passed on a retry, timed out, or passed when marked `test.fail()`. It drops passed, skipped, fixme and expected-failure tests.
- The totals in the report shrink with it. With 20 failed tests out of 2,000, the JSON report has `stats.expected: 0` and the JUnit report has `tests="20"`.
- JSON report at 20 failed tests: 3,047,208 bytes full, 157,656 bytes with `onlyFailures`. JUnit: 250,306 and 33,572. HTML (all files): 963,926 and 599,222.
- At 0 failed tests the HTML report is still 517,250 bytes with `onlyFailures`.
- Run time: no consistent difference between a reporter with and without `onlyFailures`.
- `playwright-shard-balancer update` read timings for 1,980 tests from the full JSON report and for 0 tests from the `onlyFailures` report.
- The `failures` reporter printed 21 bytes on a green run (`dot`: 4,082). At 20 failed tests it printed 26,499 bytes (`dot`: 30,441).

## Method

- `@playwright/test` 1.65.1, Node 24.14.1, macOS. No browser in the tests.
- `scripts/run-matrix.mjs`: 100 spec files with 20 tests each. Each test has 3 steps. `CI=1`. 0, 20, 100 or 400 tests fail on a `toEqual` of two objects. `workers: 4`, `retries: 0`. Arms: `dot`, `failures`, and `json`, `junit` and `html` with and without `onlyFailures` (each beside `dot`). 5 repeats, 160 runs. It records wall time, stdout size and the size of the files each reporter wrote.
- `scripts/measure-load.mjs`: 10 loads of each report from the last repeat. JSON: read and `JSON.parse`. HTML: Chromium headless, from navigation to the title of the first failed test in the page text.
- `scripts/run-semantics.mjs`: 8 tests with one outcome each, `retries: 1`, with the option in the config and with the `PLAYWRIGHT_{JSON,JUNIT,HTML}_ONLY_FAILURES` environment variables. It then merges two blob reports with and without the option, and runs `playwright-shard-balancer` 0.1.3 `update` on the JSON reports.

## Results

Report size in bytes, 2,000 tests (`results/summary.md`). HTML is the report folder; with failures it holds one `error-context.md` attachment per failed test.

| Failed tests | JSON | JSON `onlyFailures` | JUnit | JUnit `onlyFailures` | HTML | HTML `onlyFailures` |
|---|---|---|---|---|---|---|
| 0 | 2,923,336 | 2,783 | 221,779 | 102 | 891,326 | 517,250 |
| 20 | 3,047,208 | 157,656 | 250,306 | 33,572 | 963,926 | 599,222 |
| 100 | 3,539,092 | 765,500 | 363,402 | 154,724 | 1,136,222 | 773,262 |
| 400 | 5,382,965 | 3,045,664 | 786,084 | 609,493 | 1,725,792 | 1,412,756 |

Median wall time in ms over 5 runs:

| Failed tests | `dot` | JSON | JSON `onlyFailures` | JUnit | JUnit `onlyFailures` | HTML | HTML `onlyFailures` |
|---|---|---|---|---|---|---|---|
| 0 | 2,465 | 2,407 | 2,522 | 2,404 | 2,411 | 2,478 | 2,405 |
| 20 | 3,702 | 3,725 | 3,673 | 3,705 | 3,723 | 3,739 | 3,711 |
| 100 | 7,946 | 8,493 | 8,401 | 8,888 | 8,430 | 8,077 | 8,156 |
| 400 | 24,156 | 23,763 | 24,212 | 24,039 | 23,956 | 24,143 | 24,172 |

The largest difference between the medians of a reporter and its `onlyFailures` arm is 458 ms, and the sign changes from row to row. In all 12 pairs the min to max ranges of the two arms overlap (`results/summary.md`). The slowest single run took 3.3 times the median, so a difference below about 5% would not show in 5 repeats.

Terminal output in bytes:

| Failed tests | `dot` | `failures` |
|---|---|---|
| 0 | 4,082 | 21 |
| 20 | 30,441 | 26,499 |
| 100 | 135,752 | 132,290 |
| 400 | 530,483 | 528,821 |

Load time, median of 10 (`results/load.md`):

| Failed tests | JSON parse | JSON `onlyFailures` parse | HTML first test | HTML `onlyFailures` first test |
|---|---|---|---|---|
| 20 | 4.5 ms | 0.3 ms | 62.8 ms | 48.0 ms |
| 100 | 5.4 ms | 1.1 ms | 63.1 ms | 53.6 ms |
| 400 | 7.3 ms | 4.0 ms | 63.0 ms | 57.2 ms |

Outcomes, 8 tests with `retries: 1` (`results/semantics.json`):

| Test | Full reports | `onlyFailures` reports |
|---|---|---|
| passes | listed | dropped |
| fails | listed | listed |
| passes on retry | listed | listed |
| is skipped | listed in JSON and JUnit, counted in HTML | dropped |
| is fixme | listed in JSON and JUnit, counted in HTML | dropped |
| fails as expected (`test.fail()`) | listed | dropped |
| passes but should fail (`test.fail()`) | listed | listed |
| times out | listed | listed |

Totals in the same reports:

| Field | Full | `onlyFailures` |
|---|---|---|
| JSON `stats` | expected 2, skipped 2, unexpected 3, flaky 1 | expected 0, skipped 0, unexpected 3, flaky 1 |
| JUnit `<testsuites>` | tests 8, failures 2, errors 1, skipped 2 | tests 4, failures 2, errors 1, skipped 0 |
| HTML counters | All 6, Passed 2, Failed 3, Flaky 1, Skipped 2 | All 4, Passed 0, Failed 3, Flaky 1, Skipped 0 |

- The environment variables gave the same reports as the config option.
- Blob reports (JSON reporter only): two shard blobs merged to 8 tests with `--reporter json` and to 4 tests with `onlyFailures: true` in the merge config.
- `playwright-shard-balancer update`: 3 tests with timings from the full 8-test JSON report, 1 from the `onlyFailures` report. On the 2,000-test reports with 20 failed tests: 1,980 and 0. Exit code 0 both times, with `0 samples from 1 input(s)` and no warning for the `onlyFailures` report.

Not tested: interrupted tests (the source also counts them as failures), browser tests, traces, screenshots and other attachments.

## Run it

```sh
node scripts/run-matrix.mjs     # installs Playwright into work/, about 25 minutes
node scripts/measure-load.mjs   # needs work/ from the matrix
node scripts/run-semantics.mjs  # needs work/ from the matrix
```
