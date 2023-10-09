## 3.22

* Add possibility to exclude files from analysis when ***not*** in Connected Mode. [Learn more](https://docs.sonarsource.com/sonarlint/vs-code/using-sonarlint/file-exclusions)
* Add focusing on new code in connected mode [Learn more](https://docs.sonarsource.com/sonarlint/vs-code/using-sonarlint/investigating-issues/#focusing-on-new-code)
* Update JS/TS/CSS analyzer 10.5.1 -> [10.6.0](https://github.com/SonarSource/SonarJS/releases/tag/10.6.0.22520), FP fixes, QuickFix for S6326, remove S2814 for TypeScript, recommendation to use Node.js 20
* Update CFamily analyzer 6.48 -> [6.49](https://sonarsource.atlassian.net/issues/?jql=fixVersion%20%3D%2014261%20ORDER%20BY%20created%20ASC), 2 new C++ MISRA 2023 rules
* Update text and secrets analyzer 2.3.0 -> [2.4.0](https://github.com/SonarSource/sonar-text/releases/tag/2.4.0.2120) -> [2.5.0](https://github.com/SonarSource/sonar-text/releases/tag/2.5.0.2293), 42 new cloud app secrets, FP fixes, analysis time logging
* Update Python analyzer 4.7 -> [4.8](https://sonarsource.atlassian.net/projects/SONARPY/versions/14270/tab/release-report-all-issues), 8 Numpy rules and 3 quick fixes, FN fixes
* Update IaC analyzer 1.20 -> [1.21](https://github.com/SonarSource/sonar-iac/releases/tag/1.21.0.5999), 16 new rules for Docker analyzer, improved detection of Dockerfiles
* Update Go analyzer 1.14 -> [1.15](https://sonarsource.atlassian.net/projects/SONARSLANG/versions/14258/tab/release-report-all-issues), enable "NOSONAR" commentary in SonarLint, bug fixes and improvements
* Update Java analyzer 7.24 -> [7.25](https://github.com/SonarSource/sonar-java/releases/tag/7.25.0.32245), [Custom Rules] CheckRegistrar classes can register check instances, default quality profile and AutoScan

## 3.21

* Highlight clean code attributes and impacts on software qualities in rule descriptions
* In connected mode with SonarQube 10.2+, add the ability to silence an issue before the analysis
* Analysis of COBOL in connected mode with SonarCloud or SonarQube Enterprise Edition is now considered stable
* Update Java analyzer 7.22 -> [7.23](https://github.com/SonarSource/sonar-java/releases/tag/7.23.0.32023) -> [7.24](https://github.com/SonarSource/sonar-java/releases/tag/7.24.0.32100), improvements and bug fixes
* Update JS/TS/CSS analyzer 10.3.2 -> [10.4](https://github.com/SonarSource/SonarJS/releases/tag/10.4.0.22160) -> [10.5.1](https://github.com/SonarSource/SonarJS/releases/tag/10.5.1.22382), FP fixes, new JS/TS rules, support Clean Code attributes and software qualities
* Update text and secrets analyzer 2.1 -> [2.2](https://github.com/SonarSource/sonar-text/releases/tag/2.2.0.1571) -> [2.3](https://github.com/SonarSource/sonar-text/releases/tag/2.3.0.1632), detection of top 50 cloud app secrets, 22 new secret types, reduced FP rate
* Update XML analyzer 2.9 -> [2.10](https://github.com/SonarSource/sonar-xml/releases/tag/2.10.0.4108),  support Clean Code attributes and software qualities
* Update IaC analyzer 1.18 -> [1.19](https://github.com/SonarSource/sonar-iac/releases/tag/1.19.0.5623) -> [1.20](https://github.com/SonarSource/sonar-iac/releases/tag/1.20.0.5654), support Clean Code attributes and software qualities, bugfixes
* Update Go analyzer 1.13 -> [1.14](https://sonarsource.atlassian.net/projects/SONARSLANG/versions/14154/tab/release-report-all-issues), support Clean Code attributes and software qualities
* Update PHP analyzer 3.30 -> [3.31](https://github.com/SonarSource/sonar-php/releases/tag/3.31.0.9993) -> [3.32](https://github.com/SonarSource/sonar-php/releases/tag/3.32.0.10180), support PHP 8.3, 16 FP fixes, bugfixes, support Clean Code attributes and software qualities
* Update Python analyzer 4.5 -> [4.6](https://sonarsource.atlassian.net/projects/SONARPY/versions/14215/tab/release-report-all-issues) -> [4.7](https://sonarsource.atlassian.net/projects/SONARPY/versions/14230/tab/release-report-all-issues), support Clean Code attributes and software qualities, 9 new rules, FP fixes
* Update HTML analyzer 3.7.1 -> [3.8](https://github.com/SonarSource/sonar-html/releases/tag/3.8.0.3510) -> [3.9](https://github.com/SonarSource/sonar-html/releases/tag/3.9.0.3600), support Clean Code attributes and software qualities, new rule description format
* Update CFamily analyzer 6.47 -> [6.48](https://sonarsource.atlassian.net/issues/?jql=project%20%3D%2010166%20AND%20fixVersion%3D14218%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC), support Clean Code attributes and software qualities, new rule description format

## 3.20.2

* Contribute a walkthrough feature for new users who install SonarLint
* Clean up diagnostics on file close
* Improve UX for untrusted SSL certificates
* Update Java analyzer 7.20.0 -> [7.21.0](https://github.com/SonarSource/sonar-java/releases/tag/7.21.0.31796) -> [7.22.0](https://github.com/SonarSource/sonar-java/releases/tag/7.22.0.31918), Update 136 rule descriptions to new educational format; Fix 6 FPs
* Update IaC analyzer 1.17 -> [1.18](https://github.com/SonarSource/sonar-iac/releases/tag/1.18.0.4757), Update rule descriptions to new educational format; Bug fixes
* Update Python analyzer 4.3 -> [4.4](https://sonarsource.atlassian.net/projects/SONARPY/versions/14133/tab/release-report-all-issues) -> [4.5](https://sonarsource.atlassian.net/projects/SONARPY/versions/14193/tab/release-report-all-issues), Migrate 37 rule descriptions to the education format; Improve analysis precision; Fixing FPs and FNs
* Update XML analyzer 2.8.1 -> [2.9.0](https://github.com/SonarSource/sonar-xml/releases/tag/2.9.0.4055), Update rules metadata; SonarXML increases by 2% the TPR on C# SAST Benchmarks; Fixing FNs
* Update JS/TS/CSS analyzer 10.3.1 -> [10.3.2](https://github.com/SonarSource/SonarJS/releases/tag/10.3.2.22047), A bugfix for performance regression
* Update CFamily analyzer 6.45 -> [6.46](https://sonarsource.atlassian.net/issues/?jql=project%20%3D%2010166%20AND%20fixVersion%3D14141%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC) -> [6.47](https://sonarsource.atlassian.net/issues/?jql=project%20%3D%2010166%20AND%20fixVersion%3D%206.47%20%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC), 2 new C++ rules, 43 new Misra 2023 rules; Bug fixes and improvements

## 3.19.2

* Fix synchronization of taint vulnerabilities in connected mode with SonarCloud

## 3.19

* Allow marking known issues and taint vulnerabilities as resolved in Connected Mode
* Allow changing status of known security hotspots in Connected Mode
* Beta support for COBOL in Connected Mode with SonarCloud or SonarQube Enterprise Edition
* Update XML analyzer 2.7.0 -> [2.8.1](https://sonarsource.atlassian.net/projects/SONARXML/versions/14173/tab/release-report-all-issues), Update rule descriptions to educational format; Update documentation for rule S140.
* Update Go analyzer 1.12.0 -> [1.13.0](https://sonarsource.atlassian.net/projects/SONARSLANG/versions/14080/tab/release-report-all-issues), Update rule descriptions to new educational format
* Update Java analyzer 7.19.0 -> [7.20.0](https://sonarsource.atlassian.net/projects/SONARJAVA/versions/14125/tab/release-report-all-issues), SE engine works with incomplete semantics; FP and FN fixes, bugfixes
* Update PHP analyzer 3.29 -> [3.30](https://sonarsource.atlassian.net/projects/SONARPHP/versions/14128/tab/release-report-all-issues), Update rule metadata to new educational format
* Update JS/TS/CSS analyzer 10.2.0 -> [10.3.0](https://github.com/SonarSource/SonarJS/releases/tag/10.3.0.21893) -> [10.3.1](https://github.com/SonarSource/SonarJS/releases/tag/10.3.1.21905), Add rules from ESLint core; Support Typescript 5; FP and FN fixes, bugfixes


## 3.18

* Enable analysis of all security hotspots in a workspace folder
* Enable Security Hotspots in Connected Mode with SonarCloud
* Make code in rule descriptions easier to understand with syntax and diff highlighting
* Update JS/TS/CSS analyzer 10.1.0 -> [10.2.0](https://github.com/SonarSource/SonarJS/releases/tag/10.2.0.21568), 17 new rules for JS and TS
* Update Java analyzer 7.18.0 -> [7.19.0](https://sonarsource.atlassian.net/projects/SONARJAVA/versions/14108/tab/release-report-all-issues), improve support for analysis of Java 19; support for Java 19+ preview features needs to be enabled by setting `sonar.java.enablePreview` to `true` in `sonarlint.analyzerProperties`
* Update PHP analyzer 3.28 -> [3.29](https://sonarsource.atlassian.net/projects/SONARPHP/versions/14065/tab/release-report-all-issues), 2 new rules and precision improvements
* Update Python analyzer 4.2 -> [4.3](https://sonarsource.atlassian.net/projects/SONARPY/versions/14102/tab/release-report-all-issues), 6 new rules for the Django framework
* Update IaC analyzer 1.16 -> [1.17](https://github.com/SonarSource/sonar-iac/releases/tag/1.17.0.3976), precision improvements and bug fixes
* Update text and secrets analyzer 2.0.1 -> [2.0.2](https://github.com/SonarSource/sonar-text/releases/tag/2.0.2.1090) -> [2.1.0](https://github.com/SonarSource/sonar-text/releases/tag/2.1.0.1163), new rule descriptions
* Update CFamily analyzer 6.44 -> [6.45](https://sonarsource.atlassian.net/issues/?jql=project%20%3D%2010166%20AND%20fixVersion%3D14104%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC), Bug fixes and improvements


## 3.17

* Support analysis of CloudFormation
* Support analysis of Docker
* Support analysis of Kubernetes
* Support analysis of Terraform
* Display patch instruction specifically tailored for the library or framework in use in the rule description view
* Update JS/TS/CSS analyzer 10.0.1 -> [10.1.0](https://github.com/SonarSource/SonarJS/releases/tag/10.1.0.21143), 8 new rules available; 14 existing rules improved; ESLint upgraded to 8.36.0
* Update Java analyzer 7.17.0 -> [7.18.0](https://sonarsource.atlassian.net/projects/SONARJAVA/versions/14047/tab/release-report-all-issues), 3 new rules available; bug fixes
* Update Python analyzer 4.1 -> [4.2](https://sonarsource.atlassian.net/projects/SONARPY/versions/14081/tab/release-report-all-issues), New rules related to type hinting and regular expressions; 3 new quick fixes for regular expressions
* Update CFamily analyzer 6.43 -> [6.44](https://sonarsource.atlassian.net/issues/?jql=project%20%3D%2010166%20AND%20fixVersion%3D14067%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC), Bug fixes and improvements


## 3.16

* Update Python analyzer 4.0 -> [4.1](https://sonarsource.atlassian.net/projects/SONARPY/versions/14052/tab/release-report-all-issues), initial support for IPython syntax in Jupyter notebooks
* Update PHP analyzer 3.27.1 -> [3.28](https://sonarsource.atlassian.net/projects/SONARPHP/versions/14048/tab/release-report-all-issues), precision improvements
* Update CFamily analyzer 6.42 -> [6.43](https://sonarsource.atlassian.net/issues/?jql=project%20%3D%2010166%20AND%20fixVersion%20%3D%2014033%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC), support for `tiarmclang` compiler
* Support analysis of Go
* Support analysis of Python code in Jupyter Documents
* Add "Help and Feedback" view under SonarLint view container.


## 3.15.1
 
* In Connected Mode, SonarCloud/SonarQube Quality Profile is now being applied for secret detection rules
* Update JS/TS/CSS analyzer 9.13.0 -> [10.0.0](https://github.com/SonarSource/SonarJS/releases/tag/10.0.0.20728) -> [10.0.1](https://github.com/SonarSource/SonarJS/releases/tag/10.0.1.20755), support for JavaScript analysis inside HTML files, FN and FP fixes, dependency upgrades
* Update CFamily analyzer 6.41.0 -> [6.42.0](https://sonarsource.atlassian.net/issues/?jql=project%20%3D%2010166%20AND%20fixVersion%20%3D%2013995%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC), Support for clang-cl and Microchip compilers
* Update Python analyzer 3.21 -> [3.25](https://github.com/SonarSource/sonar-python/releases/tag/3.25.0.10992) -> [4.0.0](https://github.com/SonarSource/sonar-python/releases/tag/4.0.0.11155), New quick fixes available, FN and FP fixes
* Update Java analyzer 7.16.0 -> [7.17.0](https://sonarsource.atlassian.net/projects/SONARJAVA/versions/14008/tab/release-report-all-issues), New quick fixes available, FP and FN fixes, bugfixes

## 3.14

* Local detection of [Security Hotspots](https://docs.sonarsource.com/sonarlint/vs-code/using-sonarlint/security-hotspots/)
* Update PHP analyzer 3.25.0 -> [3.26.0](https://github.com/SonarSource/sonar-php/releases/tag/3.26.0.9313) -> [3.27.0](https://github.com/SonarSource/sonar-php/releases/tag/3.27.0.9339) -> [3.27.1](https://github.com/SonarSource/sonar-php/releases/tag/3.27.1.9352), Fix parsing error on namespaces with reserved words
* Update CFamily analyzer 6.40.0 -> [6.41.0](https://sonarsource.atlassian.net/issues/?jql=project%20%3D%2010166%20AND%20fixVersion%20%3D%2013953%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC), 13 new rules on C++20's "std::format"
* Update Java analyzer 7.15.0 -> [7.16.0](https://sonarsource.atlassian.net/projects/SONARJAVA/versions/13922/tab/release-report-all-issues), FP fixes, bugfixes, FN fixes
* Update JS/TS/CSS analyzer 9.12.1 -> [9.13.0](https://github.com/SonarSource/SonarJS/releases/tag/9.13.0.20537), FN and FP fixes, dependency upgrades
* Update XML analyzer 2.6.1 -> [2.7.0](https://github.com/SonarSource/sonar-xml/releases/tag/2.7.0.3820), Bugfix of XPathCheck, bugfix of memory leak

## 3.13

* Introduce dedicated "SonarLint" view container
* Fix usability issues with automatic project binding
* Update JS/TS/CSS analyzer 9.10 -> [9.11.0](https://github.com/SonarSource/SonarJS/releases/tag/9.11.0.20161) -> [9.12.0](https://github.com/SonarSource/SonarJS/releases/tag/9.12.0.20319) -> [9.12.1](https://github.com/SonarSource/SonarJS/releases/tag/9.12.1.20358), enable support for CSS, add typed rules for JavaScript, support TypeScript 4.9, improve performance and user experience about `tsconfig.json` files, 6 new rules related to performance in React
* Update Python analyzer 3.20 -> [3.21](https://github.com/SonarSource/sonar-python/releases/tag/3.21.0.10628), support for Python 3.11, improve performance and accuracy
* Update HTML analyzer 3.6.0 -> [3.7.0](https://github.com/SonarSource/sonar-html/releases/tag/3.7.0.3298) -> [3.7.1](https://github.com/SonarSource/sonar-html/releases/tag/3.7.1.3306), bug fixes and improvements
* Update CFamily analyzer 6.39.0 -> [6.40.0](https://sonarsource.atlassian.net/issues/?jql=project%20%3D%2010166%20AND%20fixVersion%20%3D%2013928%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC), 6 new rules on C++/20 "concepts"

## 3.12

* Display all Taint Vulnerabilities for bound projects in Connected Mode, UX improvements
* Update Python analyzer 3.18.0 -> [3.19.0](https://github.com/SonarSource/sonar-python/releases/tag/3.19.0.10254) -> [3.20.0](https://github.com/SonarSource/sonar-python/releases/tag/3.20.0.10345), 1 new rule, 4 new quick fixes, improved CDK analysis
* Update XML analyzer 2.5.0 -> [2.6.0](https://github.com/SonarSource/sonar-xml/releases/tag/2.6.0.3672) -> [2.6.1](https://github.com/SonarSource/sonar-xml/releases/tag/2.6.1.3686), updated dependencies, support OWASP Top 10 2021 metadata tags, read properties in disallowed dependencies rule
* Update Java analyzer 7.13.0 -> [7.14.0](https://github.com/SonarSource/sonar-java/releases/tag/7.14.0.30229) -> [7.15.0](https://github.com/SonarSource/sonar-java/releases/tag/7.15.0.30507), FP fixes, bugfixes, quick fix suggestions improved
* Update JS/TS analyzer 9.8.0 -> [9.9.0](https://github.com/SonarSource/SonarJS/releases/tag/9.9.0.19492) -> [9.10.0](https://github.com/SonarSource/SonarJS/releases/tag/9.10.0.19937), FP fixes, improvements, 2 AWS CDK rules
* Update CFamily analyzer 6.37.0 -> [6.38.0](https://sonarsource.atlassian.net/browse/CPP-3591?jql=project%20%3D%2010166%20AND%20fixVersion%20%3D%2013853%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC) -> [6.39.0](https://sonarsource.atlassian.net/browse/CPP-3891?jql=project%20%3D%2010166%20AND%20fixVersion%20%3D%2013885%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC), bug fixes and improvements

## 3.11

* Simplify user token generation when configuring connected mode with SonarQube 9.7+
* Honor `sonarlint.ls.javaHome` setting for all platforms
* Update CFamily analyzer 6.36 -> [6.37](https://sonarsource.atlassian.net/issues/?jql=project%20%3D%2010166%20AND%20fixVersion%20%3D%2013801%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC), bug fixes and improvements
* Update PHP analyzer 3.23 -> [3.24](https://github.com/SonarSource/sonar-php/releases/tag/3.24.0.8949) -> [3.25](https://github.com/SonarSource/sonar-php/releases/tag/3.25.0.9077), added support for PHP 8.2, improvements and bugfixes
* Update JS/TS analyzer 9.7 -> [9.8](https://github.com/SonarSource/SonarJS/releases/tag/9.8.0.19239), TypeScript 4.8,deprecation of Node.JS v14, remove support for Node.JS v12
* Update Python analyzer 3.17 -> [3.18](https://github.com/SonarSource/sonar-python/releases/tag/3.18.0.10116), 9 new rules about Encryption (Rest / Transit) on AWS CDK for Python

## 3.10

* Suggest users using SonarLint Connected Mode to configure project bindings with their SonarQube/SonarCloud projects
* Update Python analyzer 3.15 -> [3.16](https://github.com/SonarSource/sonar-python/releases/tag/3.16.0.9967) -> [3.17](https://github.com/SonarSource/sonar-python/releases/tag/3.17.0.10029), 8 new unit test rules, bugfixes and false positive fixes
* Update Secrets analyzer 1.1 -> 1.2, remove warning about packaged dependencies

## 3.9

* Automatically synchronize issues and taint vulnerabilities in connected mode (with SQ 9.6+)
* Update JS/TS analyzer 9.4 -> [9.5](https://github.com/SonarSource/SonarJS/releases/tag/9.5.0.18531) -> [9.6](https://github.com/SonarSource/SonarJS/releases/tag/9.6.0.18814) -> [9.7](https://github.com/SonarSource/SonarJS/releases/tag/9.7.0.18911), add React rules, support for JavaScript in YAML, FP fixes for React
* Update CFamily analyzer 6.35 -> [6.36](https://sonarsource.atlassian.net/issues/?jql=project%20%3D%2010166%20AND%20fixVersion%20%3D%2013776%20ORDER%20BY%20priority%20DESC%2C%20key%20ASC), bug fixes and improvements

## 3.8

* Add views to manage project binding with connected mode

## 3.7

* Ship Java 17 runtime with select supported platforms (Windows x86-64, macOS x86-64 and arm-64, Linux x86-64)
* Update JS/TS analyzer 9.2 -> [9.3](https://github.com/SonarSource/SonarJS/releases/tag/9.3.0.18033) -> [9.4](https://github.com/SonarSource/SonarJS/releases/tag/9.4.0.18205), Support for Typescript 4.7, Upgrade stylelint to 14.9.1, 3 new rules added, FP fixes
* Update CFamily analyzer 6.34 -> [6.35](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10090&version=17447), 2 new rules, bug fixes and improvements
* Update Java analyzer 7.12.1-> [7.13](https://github.com/SonarSource/sonar-java/releases/tag/7.13.0.29990), 7 new code quality rules for AWS Cloud functions

## 3.6

* Add views to manage connected mode authentication, move authentication tokens to secret storage
* Update Java analyzer 7.11.0 -> [7.12](https://github.com/SonarSource/sonar-java/releases/tag/7.12.0.29739) -> [7.12.1](https://github.com/SonarSource/sonar-java/releases/tag/7.12.1.29810), new rules + rules improvements, Incremental PR analysis with cache.
* Update PHP analyzer 3.23 -> [3.23.1](https://github.com/SonarSource/sonar-php/releases/tag/3.23.1.8766), descriptions for rule properties of S1808, FP fix for S6328
* Update CFamily analyzer 6.33 -> [6.34](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10090&version=17396), 1 new rule, improvements for SonarLint VSCode
* Update Python analyzer 3.14 -> [3.15](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=17427) -> [3.15.1](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=17467), first Quick Fixes for Python

## 3.5.4

* Fix an issue with URI-encoded characters in file paths

## 3.5.3

* Update Java analyzer 7.8.1 -> [7.9](https://github.com/SonarSource/sonar-java/releases/tag/7.9.0.28969) -> [7.10](https://github.com/SonarSource/sonar-java/releases/tag/7.10.0.29108) -> [7.11](https://github.com/SonarSource/sonar-java/releases/tag/7.11.0.29148), enable parsing of Java 18 preview features, rules fixes.
* Update JS/TS analyzer 9.1 -> [9.2](https://github.com/SonarSource/SonarJS/releases/tag/9.2.0.17876), Node.js 12.22.0 or later required, improvements and FP fixes
* Update CFamily analyzer 6.32 -> [6.33](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10090&version=17352), bug-fixes for compilation database
* Update Python analyzer 3.12 -> [3.13](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=17370) -> [3.14](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=17400), fixes for false positives
* Subscribe to server events to synchronize quality profiles and rule configuration
* Lots of small bug fixes


## 3.4.1

* Fix error during analysis of files not in a Git repo (connected mode only)

## 3.4.0

* Support analysis of C and C++ code.
* Update Python analyzer 3.9 -> [3.10](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=17154) -> [3.11](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=17263) -> [3.12](https://jira.sonarsource.com/secure/ReleaseNote.jspa?projectId=10958&version=17355),  support third-party Typeshed libraries, 9 new "simple" rules (8 code smells + 1 bug),  8 new regex related rules, fixes and improvements
* Update PHP analyzer 3.22 -> [3.23](https://github.com/SonarSource/sonar-php/releases/tag/3.23.0.8726]), 9 new regex rules, bug fix for S3699
* Update JS/TS analyzer 8.8 -> [8.9](https://github.com/SonarSource/SonarJS/releases/tag/8.9.0.17411) -> [9.0](https://github.com/SonarSource/SonarJS/releases/tag/9.0.0.17505) -> [9.1](https://github.com/SonarSource/SonarJS/releases/tag/8.9.0.17411), support for Quick Fixes, enable 23 rules with quick fixes, support TypeScript 4.6, drop support for Node.js 10 (12.22.0 is the new minimal version), 30 new quick fixes, improvements and FP fixes


## 3.3.1, 3.3.2, 3.3.3

* Fix automated deployment to OpenVSX

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
