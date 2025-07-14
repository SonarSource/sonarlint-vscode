## Product telemetry

```json
{
  "days_since_installation": 27,
  "days_of_use": 5,
  "sonarlint_version": "Visual Studio Code 1.20.1",
  "sonarlint_product": "SonarLint VSCode",
  "ide_version": "1.53.0",
  "connected_mode_used": true,
  "connected_mode_sonarcloud": true,
  "system_time": "2018-02-27T16:31:49.173+01:00",
  "install_time": "2018-02-01T16:30:49.124+01:00",
  "analyses": [
    {
      "language": "js",
      "rate_per_duration": { "0-300": 100, "300-500": 0, "500-1000": 0, "1000-2000": 0, "2000-4000": 0, "4000+": 0 }
    }
  ],
  "os": "Linux",
  "platform": "linux",
  "architecture": "x64",
  "jre": "17.0.5",
  "nodejs": "11.12.0",
  "server_notifications": {
    "disabled": false,
    "count_by_type": {
      "NEW_ISSUES": { "received": 1, "clicked": 1 },
      "QUALITY_GATE": { "received": 1, "clicked": 0 }
    }
  },
  "show_hotspot": {
    "requests_count": 3
  },
  "taint_vulnerabilities": {
    "investigated_remotely_count": 1,
    "investigated_locally_count": 4
  },
  "rules": {
    "default_disabled": ["java:S2204", "java:S3751", "java:S322", "java:S228"],
    "non_default_enabled": ["java:S282", "java:S1415", "java:S1234", "java:S222"],
    "raised_issues": ["java:S318", "java:S500", "java:S282", "java:S1656", "java:S1872"],
    "quick_fix_applied": ["java:S1656", "java:S1872"]
  },
  "hotspot": {
    "open_in_browser_count": 5,
    "status_changed_count": 3
  },
  "issue": {
    "status_changed_count": 2
  },
  "help_and_feedback": {
    "count_by_link": {
      "docs": 5,
      "faq": 4 
    }
  },
  "cayc": {
    "new_code_focus": {
      "enabled": true,
      "changes": 5
    }
  },
  "show_issue": {
    "requests_count": 3
  },
  "vscode": {
    "uiKind": "Web",
    "remoteName": "codespaces",
    "installTime": "2018-02-01T16:30:49.124+01:00",
    "isTelemetryEnabled": "true",
    "machineId": "123456"
  },
  "shared_connected_mode": {
    "manual_bindings_count": 3,
    "imported_bindings_count": 2,
    "auto_bindings_count": 1,
    "exported_connected_mode_count": 4
  },
  "ai_fix_suggestions": [
    {
      "suggestion_id": "eb93b2b4-f7b0-4b5c-9460-50893968c264",
      "count_snippets": 4,
      "opened_from": "SONARCLOUD",
      "snippets": [
          {
            "status": "ACCEPTED",
            "snippet_index": null
          }
      ]
    },
    {
      "ai_suggestion_id": "eb93b2b4-f7b0-4b5c-9460-50893968c261",
      "count_snippets": 2,
      "opened_from": "SONARCLOUD",
      "snippets": [
          {
            "status": null,
            "snippet_index": null
          }
      ]
    }
  ]
}
```

## Telemetry measures

```json
{
  "message_uuid":"9d0cf582-219e-4bab-8311-d599c55c4ce2",
  "os":"Linux",
  "install_time":"2024-10-29T18:00:28.758+01:00",
  "sonarlint_product":"SonarLint VSCode",
  "dimension":"installation",
  "metric_values": [
    {"key":"shared_connected_mode.manual","value":"0","type":"integer","granularity":"daily"},
    {"key":"shared_connected_mode.imported","value":"0","type":"integer","granularity":"daily"},
    {"key":"shared_connected_mode.auto","value":"0","type":"integer","granularity":"daily"},
    {"key":"shared_connected_mode.exported","value":"0","type":"integer","granularity":"daily"},
    {"key":"bindings.child_count","value":"0","type":"integer","granularity":"daily"},
    {"key":"bindings.server_count","value":"1","type":"integer","granularity":"daily"},
    {"key":"bindings.cloud_eu_count","value":"0","type":"integer","granularity":"daily"},
    {"key":"bindings.cloud_us_count","value":"0","type":"integer","granularity":"daily"},
    {"key":"help_and_feedback.gethelp","value":"1","type":"integer","granularity":"daily"},
    {"key":"quick_fix.applied_count","value":"2","type":"integer","granularity":"daily"},
    {"key":"ide_issues.found","value":"3","type":"integer","granularity":"daily"},
    {"key":"ide_issues.fixed","value":"3","type":"integer","granularity":"daily"},
    {"key":"tools.lm_sonarqube_analyze_file_error_count","value":"1","type":"integer","granularity":"daily"},
    {"key":"tools.lm_sonarqube_analyze_file_success_count","value":"7","type":"integer","granularity":"daily"},
    {"key":"performance.largest_file_count","value":"26770","type":"integer","granularity":"daily"},
    {"key":"performance.largest_file_count_ms","value":"5311","type":"integer","granularity":"daily"},
    {"key":"performance.longest_file_count_ms","value":"8907","type":"integer","granularity":"daily"},
    {"key":"performance.longest_file_count","value":"25802","type":"integer","granularity":"daily"},
    {"key":"findings_investigation.taints_locally","value":"4","type":"integer","granularity":"daily"},
    {"key":"findings_investigation.taints_remotely","value":"0","type":"integer","granularity":"daily"},
    {"key":"findings_investigation.hotspots_locally","value":"0","type":"integer","granularity":"daily"},
    {"key":"findings_investigation.hotspots_remotely","value":"0","type":"integer","granularity":"daily"},
    {"key":"findings_investigation.issues_locally","value":"3","type":"integer","granularity":"daily"},
    {"key":"fingings_filtered.fix_available","value":"1","type":"integer","granularity":"daily"}
  ]
}
```
