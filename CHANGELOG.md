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
