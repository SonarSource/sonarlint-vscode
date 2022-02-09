## 3.3.0

* Update JS/TS analyzer 8.4 -> [8.5](https://github.com/SonarSource/SonarJS/releases/tag/8.5.0.16762) -> [8.6](https://github.com/SonarSource/SonarJS/releases/tag/8.6.0.16913) -> [8.7](https://github.com/SonarSource/SonarJS/releases/tag/8.7.0.17093) -> [8.8](https://github.com/SonarSource/SonarJS/releases/tag/8.8.0.17228), 8 new rules about tests, support for TypeScript 4.4, improved resolution of TypeScript compiler settings, deprecate Node 12 (Node 16 is recommended)
* Update Java analyzer 7.4 -> [7.5](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=17008) -> [7.6](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=17063) -> [7.7](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=17102) -> [7.8](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=17149), support for new nullability annotations, 4 new vulnerability detection rules about XML processing, bug fixes and improvements
* Update PHP analyzer 3.21 -> [3.22](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=17071), support PHP 8.1
* Update Python analyzer 3.6 -> [3.7](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=16899) -> [3.8](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=17054) -> [3.9](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=17115), 12 new rules about regular expressions, support Python 3.10, improve performance of symbol resolution
* Update HTML analyzer 3.4 -> [3.5](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10969&version=16781) -> [3.6](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10969&version=17150), support SalesForce Aura Lightning Components and Twig templates, fix false positives
* Enable analysis of XML files
* In connected mode, silently synchronize quality profiles at regular intervals

## 3.2.0

* Load taint vulnerabilities and issue suppressions from the appropriate branch in connected mode

## 3.1.0

* Update Java analyzer 7.3.0 -> [7.4.0](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16940), 1 new vulnerability detection rule, improvements in precision
* Update PHP analyzer 3.20 -> [3.21](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16984), 9 new rules about regular expressions
* Fix protocol issues in connected mode with some HTTP proxies

## 3.0.0

* Require JRE 11+ to run the language server

## 2.3.0

* Allow analyzers to contribute quick fixes
* Update Java analyzer 7.2.0 -> [7.3.0](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16885), quick fixes for 40 rules, FP and bug fixes
* Update Secrets analyzer 1.0 -> [1.1](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=12535&version=16880), 4 new rules for top cloud providers, multiline secrets detection
* Update JS/TS analyzer 8.1.0 -> [8.2](https://github.com/SonarSource/SonarJS/releases/tag/8.2.0.16042) -> [8.3](https://github.com/SonarSource/SonarJS/releases/tag/8.3.0.16208) -> [8.4](https://github.com/SonarSource/SonarJS/releases/tag/8.4.0.16431), 19 new rules for regular expressions, fixes for false positives
* Update PHP analyzer 3.18 -> [3.19.0](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16920) -> [3.20.0](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16941), 17 new rules on WordPress and regexes, improvements, FP and bug fixes 

## 2.2.0

* Minor changes for CodeSpaces compatibility

## 2.1.2

* Hotfix release
  * Consider file not ignored if git command fails
  * Consider file not ignored if ignore check fails

## 2.1.1

* Detect AWS secrets in any file (2 rules)
* Update JS/TS analyzer 7.4.2 -> [7.4.3](https://github.com/SonarSource/SonarJS/releases/tag/7.4.3.15529) -> [7.4.4](https://github.com/SonarSource/SonarJS/releases/tag/7.4.4.15624) -> [8.0.0](https://github.com/SonarSource/SonarJS/releases/tag/8.0.0.15689) -> [8.0.1](https://github.com/SonarSource/SonarJS/releases/tag/8.1.0.15788), support TypeScript 4.3, bug fixes and improvements
* Update Java analyzer 6.15.1 -> [7.0](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16741) -> [7.1](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16821) -> [7.2](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16846), 10 new rules, better Java 16 support, many bug fixes and improvements
* Update PHP analyzer 3.17.0 -> [3.18.0](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16800), bug fixes and improvements
* Update Python analyzer 3.5.0 -> [3.6.0](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=16809), better analysis for medium-sized projects and other improvements

## 2.0.0

* Update Python analyzer 3.4 -> [3.5](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=16725), improve precision thanks to cross-module resolution of symbols
* Drop support of SonarQube < 7.9 for connected mode

## 1.22.0

* Report "Blocker" and "Critical" issues at the "Warning" level
* Check at startup and at regular intervals for binding updates in connected mode
* Update Java analyzer 6.13 -> [6.14](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16672) -> [6.15](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16700) -> [6.15.1](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16745), 6 new rules, fewer FPs and FNs, rule improvements
* Update JS/TS analyzer 7.1 -> [7.2](https://github.com/SonarSource/SonarJS/milestone/32?closed=1) -> [7.2.1](https://github.com/SonarSource/SonarJS/milestone/34?closed=1) -> [7.3](https://github.com/SonarSource/SonarJS/milestone/33?closed=1) -> [7.4](https://github.com/SonarSource/SonarJS/milestone/35?closed=1) -> [7.4.1](https://github.com/SonarSource/SonarJS/milestone/37?closed=1) -> [7.4.2](https://github.com/SonarSource/SonarJS/milestone/38?closed=1), support for TypeScript 4.2, analyze TypeScript in Vue.js components, fewer FPs and FNs
* Update PHP analyzer 3.15 -> [3.16](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16652) -> [3.17](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16724), fewer false positives, dependency upgrades
* Update HTML analyzer 3.3 -> [3.4](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10969&version=16643), fewer false positives, dependency upgrades
* Update Python analyzer 3.3 -> [3.4](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=16719) -> [3.4.1](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=16762), dependency upgrades


## 1.21.0

* Show secondary locations of issues in a dedicated view
* Highlight taint vulnerabilities in connected mode
* Update Python analyzer 3.2 -> [3.3](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=16644), 2 new vulnerability detection rules
* Update PHP analyzer 3.14 -> [3.15](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16629), 3 new vulnerability detection rules
* Update Java analyzer 6.11 -> [6.12](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16623) -> [6.13](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16653), support for Java 15, 8 new rules

## 1.20.0

* Review a Security Hotspot within its context in connected mode with SonarQube
* Update JavaScript and TypeScript analyzer 7.0.1 -> [7.1.0](https://github.com/SonarSource/SonarJS/issues?q=is%3Aclosed+milestone%3A7.1), 6 new rules, fewer false positives, formatting improvements
* Update Java analyzer 6.10 -> [6.11](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16532), 3 new rules, introduce sonar.java.jdkHome global variable to control JDK for the analyzer, improvements for Mockito, MongoDB and JDBC, add secondary locations for 13 rules, 9 FP fixes, 3 FN fixes, size optimization, bug fixes 
* Update PHP analyzer 3.13 -> [3.14](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16533), 2 FP fixes, bug fixes
* Update Python analyzer 3.1 -> [3.2](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=16431), support Python 3.9, improvements and bug fixes

## 1.19.0

* Enable server notifications in connected mode with SonarQube or SonarCloud
* Update JavaScript and TypeScript analyzer 6.5 -> [6.6](https://github.com/SonarSource/SonarJS/issues?q=is%3Aclosed+milestone%3A6.6) -> [6.7](https://github.com/SonarSource/SonarJS/issues?q=is%3Aclosed+milestone%3A6.7) -> [7.0](https://github.com/SonarSource/SonarJS/issues?q=is%3Aclosed+milestone%3A7.0) -> [7.0.1](https://github.com/SonarSource/SonarJS/issues?q=is%3Aclosed+milestone%3A7.0.1), many new rules related to cryptography, all rules migrated to ESLint parser
* Update PHP analyzer 3.10 -> [3.11](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16450) -> [3.12](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16468) -> [3.13](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16489), support of PHP 8, improved messages on secondary locations
* Update HTML analyzer 3.2 -> [3.3](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10969&version=15226), rules improvements
* Update Java analyzer 6.9 -> [6.10](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16444), new rules on regular expressions

## 1.18.0

* Update Java analyzer 6.6 -> [6.7](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16363) -> [6.8](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16411) -> [6.9](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16434), lots of new rules, bug fixes, fewer false positives and false negatives
* Update PHP analyzer 3.6 -> [3.7](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16364) -> [3.8](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16373) -> [3.9](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16394) -> [3.10](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16401), 20 new rules, including 13 related to unit tests
* Update Python analyzer 3.0 -> [3.1](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=16353), 3 new rules
* Update JavaScript and TypeScript analyzer 6.3 -> [6.4](https://github.com/SonarSource/SonarJS/releases/tag/6.4.0.12803) -> [6.5](https://github.com/SonarSource/SonarJS/releases/tag/6.5.0.13383), many improvements and bug fixes
* Provide direct feedback about unmet dependency on JRE and/or Node.js

## 1.17.0

* Allow configuration of rule parameters in user settings
* Display rule severity defined in the quality profile
* Update Python analyzer 2.11 -> [2.12](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=16024) -> [2.13](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=16132) -> [3.0](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=16334), 12 new rules, 2 FP fixes, bug fixes and improvements
* Update Java analyzer 6.4 -> [6.5](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=16028) -> [6.6](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=15723), 22 new rules, 21 FP fixes, bug fixes and improvements
* Update JS analyzer 6.2 -> [6.3](https://github.com/SonarSource/SonarJS/releases/tag/6.3.0.12464), bug fixes and improvements
* Update PHP analyzer 3.4 -> [3.5](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16027) -> [3.6](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=16335), 14 new rules (3 security related), bug fixes and improvements
* Gracefully wait for the Java Language Server to be started in [standard mode](https://code.visualstudio.com/docs/java/java-project#_lightweight-mode) before analyzing Java files

## 1.16.0

* Update Python analyzer 2.5 -> [2.11](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=15735), 44 new rules, support for Python 3.8, improved accuracy through use of built-in types, count module-level docstrings as comments
* Update Java analyzer 6.1 -> [6.4](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10973&version=15741), 14 new rules for Java, 9 of them for tests, fewer false positives
* Update PHP analyzer 3.3 -> [3.4](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=15297), fewer false positives
* Update JS/TS analyzer 5.1 -> [6.2](https://github.com/SonarSource/SonarJS/releases/tag/6.2.0.12043), 8 new rules, 31 JS rules now also available for TS, performance improvements

## 1.15.0

* Add support for Java analysis (requires [Java](https://marketplace.visualstudio.com/items?itemName=redhat.java) extension 0.56.0+)
* Update SonarPython 2.4 -> [2.5](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=15531), 3 new vulnerability detection rules, fewer false positives thanks to engine improvements

## 1.14.0

* Group 'on change' analysis triggers to lower CPU usage
* Remove default value for `testFilePattern` setting. By default all files are now analyzed as application code
* Update SonarPython 2.3 -> [2.4](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=15304), engine improvements and bug fixes
* Automatically offer to download a JRE if none was detected/configured
* Change connected mode settings to differentiate SonarCloud from SonarQube
* Add 2 new settings to control SonarLint output verbosity (quiet by default)

## 1.13.0

* Update SonarPython 1.15.1 -> [1.16](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=15180) -> [1.17](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=15235) -> [2.0](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=15236) -> [2.1](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=15266) -> [2.2](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=15288) -> [2.3](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=15289), 19 new rules, improvements on existing rules thanks to a new engine
* Update SonarPHP 3.2 -> [3.3](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=15126), support PHP 7.4

## 1.12.0

* Allow to configure a different binding per workspace folder

## 1.11.0

* Add the ability to activate rules that are not enabled by default
* Show list of available rules in a dedicated view, with ability to activate/deactivate rules from this view
* Drop support of SonarQube < 6.7 in connected mode
* Support "Ignore Issues on Files" and "Ignore Issues in Blocks" settings in connected mode
* Avoid downloading analyzers that are not supported
* Update SonarPython 1.12 -> [1.15](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=15008), 3 new vulnerability detection rules
* Update SonarPHP 3.0 -> [3.1.1](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=14954) -> [3.2](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=14979)

## 1.10.0

* Add a code action and related settings to deactivate rules
* Update SonarHTML 3.1 -> [3.2](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10969&version=14855) to support Vue.js and enable accessibility-related rules

## 1.9.0

* Enable support of PL/SQL in connected mode
* Support for connected mode on all sub-folders of a same project in a workspace

## 1.8.0

* Enable support of Apex in connected mode

## 1.7.0

* Update SonarPHP 2.16 -> [3.0](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=14844) to support PHP 7.3
* Fix rule description panel on VSCode 1.33+

## 1.6.0

* Update SonarPHP 2.14 -> [2.15](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=14493) -> [2.16](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=14751)
* Update SonarPython 1.10 -> [1.12](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=14849)
* Update SonarTS 1.7 -> [1.8](https://github.com/SonarSource/SonarTS/milestone/14?closed=1) -> [1.9](https://github.com/SonarSource/SonarTS/milestone/15?closed=1)
* Update SonarJS 4.2 -> [5.0](https://github.com/SonarSource/SonarJS/milestone/11?closed=1) -> [5.1](https://github.com/SonarSource/SonarJS/milestone/13?closed=1)
* Add support for HTML and JSP (using SonarHTML analyzer)

## 1.5.0

* Report secondary issue locations as [related diagnostics information](https://code.visualstudio.com/updates/v1_22#_support-related-diagnostics-information)
* Update SonarJS 4.1 -> [4.2](https://github.com/SonarSource/SonarJS/milestone/10?closed=1)
* Update SonarPHP 2.13 -> [2.14](https://jira.sonarsource.com/jira/secure/ReleaseNote.jspa?projectId=10956&version=14346)
* The language server can run with Java 10

## 1.4.0

* Update SonarTS 1.6 -> [1.7](https://github.com/SonarSource/SonarTS/milestone/13?closed=1)

## 1.3.0

* Add basic support for connected mode
  * Track server issues and hide resolved
  * Add command to update bindings and sync
* Add basic support for multi-root workspace
* Update embedded analyzers
  * SonarJS 4.0 -> 4.1
  * SonarTS 1.5 -> 1.6
  * SonarPHP 2.12 -> 2.13
  * SonarPython 1.8 -> 1.10

## 1.2.0

* Add support for TypeScript (using SonarTS analyzer)
* Update SonarJS to [version 4.0](https://github.com/SonarSource/sonar-javascript/milestone/8?closed=1)
  * Support Vue.js single file components
  * Flow syntax support
  * Exclude node_modules folder
  * Many rules improvements
* Update SonarPHP to [version 2.12](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10956&version=14064)
  * Support for PHP 7.1 and 7.2
  * Many new rules and rules improvements

## 1.1.0

* Update SonarJS to [version 3.1](https://github.com/SonarSource/sonar-javascript/milestone/4?closed=1)
  * 1 new rule
* Display rule description directly inside VSCode

## 1.0.0

* First release
* On-the-fly analysis of JavaScript, Python and PHP
* SonarJS 3.0
* SonarPHP 2.10
* SonarPython 1.8
