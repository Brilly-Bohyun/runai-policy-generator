import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { generatePolicy } from "../src/policy";
import type { GenerateRequest } from "../src/types";

function buildPolicy(overrides: Partial<GenerateRequest>): GenerateRequest {
  return {
    workloadType: "workspace",
    selected: [],
    imposedAssets: [],
    ...overrides
  };
}

describe("generatePolicy", () => {
  it("renders itemized defaults as YAML objects instead of raw strings", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "environmentVariables",
            sectionId: "basic",
            value: {
              instances: ["name=MY_ENV, value=my_value"],
              attributes: ["exclude=false"]
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.environmentVariables.instances).toEqual([
      { name: "MY_ENV", value: "my_value" }
    ]);
    expect(document.defaults.environmentVariables.attributes).toEqual({ exclude: false });
    expect(document.rules).toBeNull();
    expect(document.imposedAssets).toBeNull();
  });

  it("normalizes imposed asset IDs", () => {
    const result = generatePolicy(
      buildPolicy({
        imposedAssets: [
          " f12c965b-44e9-4ff6-8b43-01d8f9e630cc ",
          "",
          "f12c965b-44e9-4ff6-8b43-01d8f9e630cc",
          "4ba37689-f528-4eb6-9377-5e322780cc27"
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.imposedAssets).toEqual([
      "f12c965b-44e9-4ff6-8b43-01d8f9e630cc",
      "4ba37689-f528-4eb6-9377-5e322780cc27"
    ]);
    expect(result.summary.assetCount).toBe(2);
  });

  it("keeps numeric-looking environment variable values as strings", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "environmentVariables",
            sectionId: "basic",
            value: {
              instances: ["name=MAX_RETRIES, value=3"],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.environmentVariables.instances).toEqual([
      { name: "MAX_RETRIES", value: "3" }
    ]);
  });

  it("renders environment variable value sources without requiring a literal value", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "environmentVariables",
            sectionId: "basic",
            value: {
              instances: [
                "name=POSTGRES_PASSWORD, secret.name=postgres-secret, secret.key=POSTGRES_PASSWORD, exclude=false",
                "name=POD_NAME, podFieldRef.path=metadata.name, description=Current pod name"
              ],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.environmentVariables.instances).toEqual([
      {
        name: "POSTGRES_PASSWORD",
        secret: {
          name: "postgres-secret",
          key: "POSTGRES_PASSWORD"
        },
        exclude: false
      },
      {
        name: "POD_NAME",
        podFieldRef: {
          path: "metadata.name"
        },
        description: "Current pod name"
      }
    ]);
  });

  it("warns and skips legacy environment variable shorthand", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "environmentVariables",
            sectionId: "basic",
            value: {
              instances: ["MAX_RETRIES=3"],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toContain("Environment Variables instances should include name.");
    expect(result.warnings).toContain(
      "Environment Variables instances should include one of value, secret, configMap, podFieldRef, userCredential."
    );
    expect(document.defaults).toBeNull();
  });

  it("uses item key fallbacks for simple URL itemized inputs", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "exposedUrls",
            sectionId: "network",
            value: {
              instances: ["https://demo.example.ai"],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.exposedUrls.instances).toEqual([
      { url: "https://demo.example.ai" }
    ]);
    expect(result.yaml).not.toContain('https: "//demo.example.ai"');
  });

  it("renders image pull secrets as workload API instances", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "imagePullSecrets",
            sectionId: "basic",
            value: "name=nvcr-pull-secret, userCredential=false, exclude=false",
            settings: {
              canEdit: false
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.imagePullSecrets.instances).toEqual([
      { name: "nvcr-pull-secret", userCredential: false, exclude: false }
    ]);
    expect(document.rules).toBeNull();
    expect(result.warnings).toContain("Image Pull Secrets does not support the canEdit rule.");
  });

  it("turns simple image pull secret names into named object entries", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "imagePullSecrets",
            sectionId: "basic",
            value: "nvcr-pull-secret, team-registry-secret",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.imagePullSecrets.instances).toEqual([
      { name: "nvcr-pull-secret" },
      { name: "team-registry-secret" }
    ]);
  });

  it("renders image pull secrets from pasted YAML array snippets", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "imagePullSecrets",
            sectionId: "basic",
            value: [
              "imagePullSecrets:",
              "  - name: nvcr-pull-secret",
              "    userCredential: true",
              "    exclude: false",
              "  - name: team-registry-secret"
            ].join("\n"),
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.imagePullSecrets.instances).toEqual([
      { name: "nvcr-pull-secret", userCredential: true, exclude: false },
      { name: "team-registry-secret" }
    ]);
  });

  it("renders image pull secrets from rootless pasted YAML arrays", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "imagePullSecrets",
            sectionId: "basic",
            value: [
              "- name: nvcr-pull-secret",
              "  userCredential: true",
              "  exclude: false",
              "- name: team-registry-secret"
            ].join("\n"),
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.imagePullSecrets.instances).toEqual([
      { name: "nvcr-pull-secret", userCredential: true, exclude: false },
      { name: "team-registry-secret" }
    ]);
  });

  it("renders scalar arrays from pasted YAML snippets", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "nodePools",
            sectionId: "scheduling",
            value: ["nodePools:", "  - pool-a", "  - pool-b"].join("\n"),
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.nodePools).toEqual(["pool-a", "pool-b"]);
  });

  it("renders scalar arrays from rootless pasted YAML arrays", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "nodePools",
            sectionId: "scheduling",
            value: "- pool-a\n- pool-b",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.nodePools).toEqual(["pool-a", "pool-b"]);
  });

  it("keeps string list-looking fields such as args as strings", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "args",
            sectionId: "basic",
            value: "--epochs=50, --batch-size=128",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.args).toBe("--epochs=50, --batch-size=128");
    expect(Array.isArray(document.defaults.args)).toBe(false);
  });

  it("renders scalar defaults from pasted policy YAML snippets", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "imagePullPolicy",
            sectionId: "basic",
            value: ["defaults:", "  imagePullPolicy: Always"].join("\n"),
            settings: {}
          },
          {
            fieldId: "cpuMemoryRequest",
            sectionId: "compute",
            value: ["defaults:", "  compute:", "    cpuMemoryRequest: 20G"].join("\n"),
            settings: {}
          },
          {
            fieldId: "cpuCoreRequest",
            sectionId: "compute",
            value: "compute:\n  cpuCoreRequest: 1.5",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.imagePullPolicy).toBe("Always");
    expect(document.defaults.compute.cpuMemoryRequest).toBe("20G");
    expect(document.defaults.compute.cpuCoreRequest).toBe(1.5);
  });

  it("renders aggregate object fields from key-value input", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "servingPort",
            sectionId: "network",
            value: "container.port=8000, protocol=http, authorizationType=public",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.servingPort).toEqual({
      container: { port: 8000 },
      protocol: "http",
      authorizationType: "public"
    });
  });

  it("renders aggregate object fields from newline-separated key-value input", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "servingPort",
            sectionId: "network",
            value: "container.port=8000\nprotocol=http\nauthorizationType=public",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.servingPort).toEqual({
      container: { port: 8000 },
      protocol: "http",
      authorizationType: "public"
    });
    expect(result.warnings).toEqual([]);
  });

  it("renders aggregate object fields from pasted YAML snippets", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "servingPort",
            sectionId: "network",
            value: [
              "servingPort:",
              "  container:",
              "    port: 8000",
              "  protocol: http",
              "  authorizationType: public"
            ].join("\n"),
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.servingPort).toEqual({
      container: { port: 8000 },
      protocol: "http",
      authorizationType: "public"
    });
  });

  it("keeps documented probe object counters numeric", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "probes",
            sectionId: "network",
            value:
              "readiness.initialDelaySeconds=2, readiness.periodSeconds=10, readiness.timeoutSeconds=1, readiness.successThreshold=1, readiness.failureThreshold=3",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.probes.readiness).toEqual({
      initialDelaySeconds: 2,
      periodSeconds: 10,
      timeoutSeconds: 1,
      successThreshold: 1,
      failureThreshold: 3
    });
  });

  it("normalizes simple probe HTTP fields to the workload API handler shape", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "probes",
            sectionId: "network",
            value:
              "readiness.path=/healthz, readiness.port=8080, readiness.host=example.com, readiness.scheme=HTTP, readiness.periodSeconds=10",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.probes.readiness).toEqual({
      periodSeconds: 10,
      handler: {
        httpGet: {
          path: "/healthz",
          port: 8080,
          host: "example.com",
          scheme: "HTTP"
        }
      }
    });
    expect(document.defaults.probes.readiness.path).toBeUndefined();
    expect(document.defaults.probes.readiness.port).toBeUndefined();
  });

  it("renders security runAsGid with workload API casing", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "runAsGid",
            sectionId: "security",
            value: 30,
            settings: {
              min: 1
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.security.runAsGid).toBe(30);
    expect(document.defaults.security.runasGid).toBeUndefined();
    expect(document.rules.security.runAsGid.min).toBe(1);
  });

  it("renders MIG profile defaults and rules from policy examples", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "standardTraining",
        selected: [
          {
            fieldId: "gpuRequestType",
            sectionId: "compute",
            value: "memory",
            settings: {}
          },
          {
            fieldId: "migProfile",
            sectionId: "compute",
            value: "1g.5gb",
            settings: {
              options: "1g.5gb, 2g.10gb"
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.compute.gpuRequestType).toBe("memory");
    expect(document.defaults.compute.migProfile).toBe("1g.5gb");
    expect(document.rules.compute.migProfile.options).toEqual([
      { value: "1g.5gb" },
      { value: "2g.10gb" }
    ]);
  });

  it("normalizes GPU device request table and example spelling variants", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "standardTraining",
        selected: [
          {
            fieldId: "gpuDeviceRequest",
            sectionId: "compute",
            value: ["defaults:", "  compute:", "    gpuDeviceRequest: 2"].join("\n"),
            settings: {
              min: ["rules:", "  compute:", "    gpuDeviceRequest:", "      min: 1"].join("\n"),
              max: ["rules:", "  compute:", "    gpuDevicesRequest:", "      max: 4"].join("\n")
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.compute.gpuDevicesRequest).toBe(2);
    expect(document.defaults.compute.gpuDeviceRequest).toBeUndefined();
    expect(document.rules.compute.gpuDevicesRequest).toEqual({
      min: 1,
      max: 4
    });
  });

  it("warns when GPU portion defaults are not locked to portion request type", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "gpuPortionRequest",
            sectionId: "compute",
            value: 0.5,
            settings: {}
          },
          {
            fieldId: "gpuRequestType",
            sectionId: "compute",
            value: "portion",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.compute.gpuPortionRequest).toBe(0.5);
    expect(document.defaults.compute.gpuRequestType).toBe("portion");
    expect(result.warnings).toContain(
      "GPU portion defaults require GPU Request Type to default to portion with options limited to portion."
    );
  });

  it("accepts GPU portion defaults when request type is locked to portion", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "gpuPortionRequest",
            sectionId: "compute",
            value: 0.5,
            settings: {}
          },
          {
            fieldId: "gpuRequestType",
            sectionId: "compute",
            value: "portion",
            settings: {
              options: "portion"
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.rules.compute.gpuRequestType.options).toEqual([{ value: "portion" }]);
    expect(result.warnings).not.toContain(
      "GPU portion defaults require GPU Request Type to default to portion with options limited to portion."
    );
  });

  it("warns for role-scoped GPU portion defaults without locked request type", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "distributedTraining",
        selected: [
          {
            fieldId: "gpuPortionRequest",
            sectionId: "compute",
            scope: "master",
            value: 0.5,
            settings: {}
          },
          {
            fieldId: "gpuRequestType",
            sectionId: "compute",
            scope: "master",
            value: "portion",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.master.compute.gpuPortionRequest).toBe(0.5);
    expect(document.defaults.master.compute.gpuRequestType).toBe("portion");
    expect(result.warnings).toContain(
      "GPU portion defaults require GPU Request Type to default to portion with options limited to portion."
    );
  });

  it("accepts corrected preemption spelling but emits the documented policy key", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "workspace",
        selected: [
          {
            fieldId: "terminateAfterPreemtpion",
            sectionId: "lifecycle",
            value: ["defaults:", "  terminateAfterPreemption: true"].join("\n"),
            settings: {
              canEdit: ["rules:", "  terminateAfterPreemption:", "    canEdit: false"].join("\n")
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.terminateAfterPreemtpion).toBe(true);
    expect(document.defaults.terminateAfterPreemption).toBeUndefined();
    expect(document.rules.terminateAfterPreemtpion.canEdit).toBe(false);
  });

  it("keeps supplementalGroups as the documented comma-separated string", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "supplementalGroups",
            sectionId: "security",
            value: "1000, 1001",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.security.supplementalGroups).toBe("1000, 1001");
    expect(Array.isArray(document.defaults.security.supplementalGroups)).toBe(false);
  });

  it("renders options and defaultFrom rules using the documented policy shape", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "imagePullPolicy",
            sectionId: "basic",
            value: "IfNotPresent",
            settings: {
              options: "value=Always, displayed=Always\nvalue=Never, displayed=Never"
            }
          },
          {
            fieldId: "cpuCoreRequest",
            sectionId: "compute",
            value: 1,
            settings: {
              defaultFrom: "field=compute.cpuCoreLimit, factor=0.5"
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.rules.imagePullPolicy.options).toEqual([
      { value: "Always" },
      { value: "Never" }
    ]);
    expect(document.rules.compute.cpuCoreRequest.defaultFrom).toEqual({
      field: "compute.cpuCoreLimit",
      factor: 0.5
    });
  });

  it("renders scalar rules from pasted policy YAML snippets", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "image",
            sectionId: "basic",
            value: "ubuntu",
            settings: {
              options: [
                "rules:",
                "  image:",
                "    options:",
                "      - value: ubuntu",
                "      - value: nvcr.io/nvidia/pytorch:24.01-py3"
              ].join("\n")
            }
          },
          {
            fieldId: "cpuCoreRequest",
            sectionId: "compute",
            value: 1,
            settings: {
              min: ["rules:", "  compute:", "    cpuCoreRequest:", "      min: 1"].join("\n"),
              max: ["rules:", "  compute:", "    cpuCoreRequest:", "      max: 7"].join("\n"),
              step: ["rules:", "  compute:", "    cpuCoreRequest:", "      step: 2"].join("\n"),
              defaultFrom: [
                "rules:",
                "  compute:",
                "    cpuCoreRequest:",
                "      defaultFrom:",
                "        field: compute.cpuCoreLimit",
                "        factor: 0.5"
              ].join("\n")
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.rules.image.options).toEqual([
      { value: "ubuntu" },
      { value: "nvcr.io/nvidia/pytorch:24.01-py3" }
    ]);
    expect(document.rules.compute.cpuCoreRequest).toEqual({
      min: 1,
      max: 7,
      step: 2,
      defaultFrom: {
        field: "compute.cpuCoreLimit",
        factor: 0.5
      }
    });
  });

  it("renders options values according to the selected field type", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "category",
            sectionId: "scheduling",
            value: "1",
            settings: {
              options: "1, 2"
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.rules.category.options).toEqual([
      { value: "1" },
      { value: "2" }
    ]);
  });

  it("warns and skips rules unsupported by the field value type", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "cpuCoreRequest",
            sectionId: "compute",
            value: 0.5,
            settings: {
              options: "0.5, 1",
              max: 2
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toContain("CPU Core Request does not support the options rule.");
    expect(document.rules.compute.cpuCoreRequest).toEqual({ max: 2 });
  });

  it("normalizes rule id aliases in scalar settings", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "cpuCoreRequest",
            sectionId: "compute",
            value: 1,
            settings: {
              "Default-From": "field=compute.cpuCoreLimit, factor=0.5",
              Step: 2
            }
          },
          {
            fieldId: "image",
            sectionId: "basic",
            value: "ubuntu",
            settings: {
              canedit: false
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.rules.compute.cpuCoreRequest.defaultFrom).toEqual({
      field: "compute.cpuCoreLimit",
      factor: 0.5
    });
    expect(document.rules.compute.cpuCoreRequest.step).toBe(2);
    expect(document.rules.image.canEdit).toBe(false);
    expect(document.rules.image.canedit).toBeUndefined();
  });

  it("warns when locking the image default can block template selection", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "image",
            sectionId: "basic",
            value: "jupyter/base-notebook:latest",
            settings: {
              canEdit: false
            }
          }
        ]
      })
    );

    expect(result.warnings).toContain(
      "Image canEdit=false can prevent templates with a different image from being selected."
    );
  });

  it("warns when locking role-scoped image defaults can block template selection", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "distributedTraining",
        selected: [
          {
            fieldId: "image",
            sectionId: "basic",
            value: "jupyter/base-notebook:latest",
            scope: "master",
            settings: {
              canEdit: false
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.master.image).toBe("jupyter/base-notebook:latest");
    expect(document.rules.master.image.canEdit).toBe(false);
    expect(result.warnings).toContain(
      "Image canEdit=false can prevent templates with a different image from being selected."
    );
  });

  it("omits numeric step rules that exceed the configured min/max range", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "gpuDeviceRequest",
            sectionId: "compute",
            value: 1,
            settings: {
              required: true,
              min: 1,
              max: 1,
              step: 1
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.rules.compute.gpuDevicesRequest).toEqual({
      required: true,
      min: 1,
      max: 1
    });
    expect(result.warnings).toContain("GPU Device Request step must not exceed the min/max range.");
  });

  it("keeps quantity rule bounds as strings", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "cpuMemoryRequest",
            sectionId: "compute",
            value: "10G",
            settings: {
              min: "1",
              max: "20G"
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.rules.compute.cpuMemoryRequest).toEqual({
      min: "1",
      max: "20G"
    });
  });

  it("coerces scalar defaults according to field value types", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "cpuCoreRequest",
            sectionId: "compute",
            value: "0.5",
            settings: {}
          },
          {
            fieldId: "parallelism",
            sectionId: "lifecycle",
            value: "2",
            settings: {}
          },
          {
            fieldId: "largeShmRequest",
            sectionId: "compute",
            value: "false",
            settings: {}
          },
          {
            fieldId: "cpuMemoryRequest",
            sectionId: "compute",
            value: "1",
            settings: {}
          },
          {
            fieldId: "category",
            sectionId: "scheduling",
            value: "123",
            settings: {}
          }
        ],
        workloadType: "standardTraining"
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.compute.cpuCoreRequest).toBe(0.5);
    expect(document.defaults.parallelism).toBe(2);
    expect(document.defaults.compute.largeShmRequest).toBe(false);
    expect(document.defaults.compute.cpuMemoryRequest).toBe("1");
    expect(document.defaults.category).toBe("123");
  });

  it("renders itemized locked keys under instances", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageHostPath",
            sectionId: "storage",
            value: {
              instances: ["name=vol-data-1, path=/data-1, mountPath=/mount/data-1"],
              attributes: []
            },
            settings: {
              locked: "vol-data-1\nvol-data-2",
              canAdd: false
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.storage.hostPath.instances).toEqual([
      { name: "vol-data-1", path: "/data-1", mountPath: "/mount/data-1" }
    ]);
    expect(document.rules.storage.hostPath.instances).toEqual({
      locked: ["vol-data-1", "vol-data-2"],
      canAdd: false
    });
  });

  it("ignores stale boolean locked settings on itemized rules", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageHostPath",
            sectionId: "storage",
            value: {
              instances: ["name=vol-data-1, path=/data-1, mountPath=/mount/data-1"],
              attributes: []
            },
            settings: {
              locked: false,
              canAdd: false
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.rules.storage.hostPath.instances).toEqual({
      canAdd: false
    });
    expect(document.rules.storage.hostPath.instances.locked).toBeUndefined();
  });

  it("normalizes structured regular ports like key-value ports", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "ports",
            sectionId: "network",
            value: {
              instances: [
                [
                  "instances:",
                  "  - container: \"8888\"",
                  "    serviceType: NodePort",
                  "    toolType: jupyter-notebook",
                  "    toolName: Jupyter"
                ].join("\n")
              ],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.ports.instances).toEqual([
      {
        container: 8888,
        toolType: "jupyter-notebook",
        toolName: "Jupyter"
      }
    ]);
  });

  it("parses documented numeric and boolean itemized keys only where appropriate", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "extendedResources",
            sectionId: "compute",
            value: {
              instances: ["resource=default/cpu, quantity=5"],
              attributes: []
            },
            settings: {}
          },
          {
            fieldId: "storageHostPath",
            sectionId: "storage",
            value: {
              instances: ["name=vol-data-1, path=/data-1, mountPath=/mount/data-1, readOnly=true"],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.compute.extendedResources.instances).toEqual([
      { resource: "default/cpu", quantity: 5 }
    ]);
    expect(document.defaults.storage.hostPath.instances).toEqual([
      { name: "vol-data-1", path: "/data-1", mountPath: "/mount/data-1", readOnly: true }
    ]);
  });

  it("normalizes toleration shortcuts to documented itemized keys", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "tolerations",
            sectionId: "scheduling",
            value: {
              instances: [
                "gpu=true:NoSchedule",
                "key=dedicated, operator=Equal, value=ml, effect=NoExecute"
              ],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.tolerations.instances).toEqual([
      { key: "gpu", operator: "Equal", value: "true", effect: "NoSchedule" },
      { key: "dedicated", operator: "Equal", value: "ml", effect: "NoExecute" }
    ]);
    expect(document.defaults.tolerations.instances[0].gpu).toBeUndefined();
  });

  it("does not render unsupported locked toleration settings", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "tolerations",
            sectionId: "scheduling",
            value: {
              instances: ["key=qa-toleration, operator=Equal, value=true, effect=NoSchedule"],
              attributes: []
            },
            settings: {
              locked: "qa-toleration",
              canAdd: false
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.tolerations.instances).toEqual([
      { key: "qa-toleration", operator: "Equal", value: "true", effect: "NoSchedule" }
    ]);
    expect(document.rules.tolerations.instances).toEqual({
      canAdd: false
    });
    expect(document.rules.tolerations.instances.locked).toBeUndefined();
    expect(result.warnings).toContain("Tolerations does not support the locked rule.");
  });

  it("renders node affinity defaults using nodeSelectorTerms and matchExpressions", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "nodeAffinityRequired",
            sectionId: "scheduling",
            value: "key=run.ai/type, operator=In, values=training|inference",
            settings: {
              canEdit: false
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.nodeAffinityRequired).toEqual({
      nodeSelectorTerms: [
        {
          matchExpressions: [
            {
              key: "run.ai/type",
              operator: "In",
              values: ["training", "inference"]
            }
          ]
        }
      ]
    });
    expect(document.rules.nodeAffinityRequired).toEqual({ canEdit: false });
  });

  it("renders multiple node affinity match expressions from multiline input", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "nodeAffinityRequired",
            sectionId: "scheduling",
            value: "key=run.ai/type, operator=In, values=training|inference\nkey=kubernetes.io/hostname, operator=NotIn, values=node-a|node-b",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.nodeAffinityRequired).toEqual({
      nodeSelectorTerms: [
        {
          matchExpressions: [
            {
              key: "run.ai/type",
              operator: "In",
              values: ["training", "inference"]
            },
            {
              key: "kubernetes.io/hostname",
              operator: "NotIn",
              values: ["node-a", "node-b"]
            }
          ]
        }
      ]
    });
  });

  it("renders node affinity from pasted policy YAML snippets", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "nodeAffinityRequired",
            sectionId: "scheduling",
            value: [
              "defaults:",
              "  nodeAffinityRequired:",
              "    nodeSelectorTerms:",
              "      - matchExpressions:",
              "          - key: app",
              "            operator: In",
              "            values:",
              "              - frontend",
              "              - backend"
            ].join("\n"),
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.nodeAffinityRequired).toEqual({
      nodeSelectorTerms: [
        {
          matchExpressions: [
            {
              key: "app",
              operator: "In",
              values: ["frontend", "backend"]
            }
          ]
        }
      ]
    });
  });

  it("renders itemized attribute rules under attributes", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "extendedResources",
            sectionId: "compute",
            value: {
              instances: ["resource=default/cpu, quantity=5"],
              attributes: ["quantity=3"]
            },
            settings: {
              attributeRules: "quantity.required=true\nurl.options=value=https://example.com"
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.compute.extendedResources.attributes).toEqual({ quantity: 3 });
    expect(document.rules.compute.extendedResources.attributes.quantity).toEqual({
      required: true
    });
    expect(document.rules.compute.extendedResources.attributes.url.options).toEqual([
      { value: "https://example.com" }
    ]);
  });

  it("keeps itemized string attribute option values as strings", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageS3",
            sectionId: "storage",
            value: {
              instances: [],
              attributes: []
            },
            settings: {
              attributeRules: "bucket.options=123\nurl.options=value=456, displayed=Numeric URL"
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.rules.storage.s3.attributes.bucket.options).toEqual([
      { value: "123" }
    ]);
    expect(document.rules.storage.s3.attributes.url.options).toEqual([
      { value: "456" }
    ]);
  });

  it("normalizes aliases in itemized attribute rules", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storagePvc",
            sectionId: "storage",
            value: {
              instances: [],
              attributes: []
            },
            settings: {
              attributeRules: "claimInfo.storageclass.required=true\nclaimInfo.accessModes.readwritemany.required=true\nclaimInfo.storageclass.canedit=false"
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.rules.storage.pvc.attributes.claimInfo.storageClass).toEqual({
      required: true,
      canEdit: false
    });
    expect(document.rules.storage.pvc.attributes.claimInfo.accessModes.readWriteMany).toEqual({
      required: true
    });
    expect(document.rules.storage.pvc.attributes.claimInfo.storageclass).toBeUndefined();
  });

  it("renders the documented whole-policy example shape", () => {
    const result = generatePolicy(
      buildPolicy({
        imposedAssets: ["4ba37689-f528-4eb6-9377-5e322780cc27"],
        selected: [
          {
            fieldId: "createHomeDir",
            sectionId: "basic",
            value: true,
            settings: { canEdit: false }
          },
          {
            fieldId: "imagePullPolicy",
            sectionId: "basic",
            value: "IfNotPresent",
            settings: { canEdit: false }
          },
          {
            fieldId: "nodePools",
            sectionId: "scheduling",
            value: ["node-pool-a", "node-pool-b"],
            settings: {}
          },
          {
            fieldId: "environmentVariables",
            sectionId: "basic",
            value: {
              instances: [
                "name=WANDB_API_KEY, value=REPLACE_ME!",
                "name=WANDB_BASE_URL, value=https://wandb.mydomain.com"
              ],
              attributes: []
            },
            settings: {
              locked: "WANDB_BASE_URL"
            }
          },
          {
            fieldId: "cpuCoreRequest",
            sectionId: "compute",
            value: 0.1,
            settings: { max: 32 }
          },
          {
            fieldId: "cpuCoreLimit",
            sectionId: "compute",
            value: 20,
            settings: { max: 32 }
          },
          {
            fieldId: "cpuMemoryRequest",
            sectionId: "compute",
            value: "10G",
            settings: { min: "1G", max: "20G" }
          },
          {
            fieldId: "cpuMemoryLimit",
            sectionId: "compute",
            value: "40G",
            settings: { min: "1G", max: "40G" }
          },
          {
            fieldId: "largeShmRequest",
            sectionId: "compute",
            value: true,
            settings: { canEdit: false }
          },
          {
            fieldId: "storageGit",
            sectionId: "storage",
            value: {
              instances: [],
              attributes: ["repository=https://git-repo.my-domain.com, branch=master"]
            },
            settings: {}
          },
          {
            fieldId: "storageHostPath",
            sectionId: "storage",
            value: {
              instances: [
                "name=vol-data-1, path=/data-1, mountPath=/mount/data-1",
                "name=vol-data-2, path=/data-2, mountPath=/mount/data-2"
              ],
              attributes: []
            },
            settings: {
              locked: "vol-data-1\nvol-data-2"
            }
          },
          {
            fieldId: "allowPrivilegeEscalation",
            sectionId: "security",
            value: false,
            settings: { canEdit: false }
          },
          {
            fieldId: "runAsUid",
            sectionId: "security",
            value: "",
            settings: { min: 1 }
          },
          {
            fieldId: "extendedResources",
            sectionId: "compute",
            value: { instances: [], attributes: [] },
            settings: { canAdd: false }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults).toMatchObject({
      createHomeDir: true,
      imagePullPolicy: "IfNotPresent",
      nodePools: ["node-pool-a", "node-pool-b"],
      compute: {
        cpuCoreRequest: 0.1,
        cpuCoreLimit: 20,
        cpuMemoryRequest: "10G",
        cpuMemoryLimit: "40G",
        largeShmRequest: true
      },
      security: {
        allowPrivilegeEscalation: false
      }
    });
    expect(document.defaults.environmentVariables.instances).toEqual([
      { name: "WANDB_API_KEY", value: "REPLACE_ME!" },
      { name: "WANDB_BASE_URL", value: "https://wandb.mydomain.com" }
    ]);
    expect(document.defaults.storage.git.attributes).toEqual({
      repository: "https://git-repo.my-domain.com",
      branch: "master"
    });
    expect(document.defaults.storage.hostPath.instances).toEqual([
      { name: "vol-data-1", path: "/data-1", mountPath: "/mount/data-1" },
      { name: "vol-data-2", path: "/data-2", mountPath: "/mount/data-2" }
    ]);
    expect(document.rules.environmentVariables.instances.locked).toEqual(["WANDB_BASE_URL"]);
    expect(document.rules.compute).toMatchObject({
      cpuCoreRequest: { max: 32 },
      cpuCoreLimit: { max: 32 },
      cpuMemoryRequest: { min: "1G", max: "20G" },
      cpuMemoryLimit: { min: "1G", max: "40G" },
      largeShmRequest: { canEdit: false },
      extendedResources: { instances: { canAdd: false } }
    });
    expect(document.rules.security).toMatchObject({
      allowPrivilegeEscalation: { canEdit: false },
      runAsUid: { min: 1 }
    });
    expect(document.rules.storage.hostPath.instances.locked).toEqual(["vol-data-1", "vol-data-2"]);
    expect(document.imposedAssets).toEqual(["4ba37689-f528-4eb6-9377-5e322780cc27"]);
  });

  it("allows boolean fields to be used for rules without forcing a false default", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "createHomeDir",
            sectionId: "basic",
            value: "",
            settings: { canEdit: false }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults).toBeNull();
    expect(document.rules.createHomeDir).toEqual({ canEdit: false });
    expect(result.warnings).not.toContain("Create Home Dir has no default value yet.");
  });

  it("renders explicit false boolean defaults when the user selects false", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "createHomeDir",
            sectionId: "basic",
            value: false,
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.createHomeDir).toBe(false);
    expect(document.rules).toBeNull();
  });

  it("renders dotted keys in itemized instances as nested YAML", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storagePvc",
            sectionId: "storage",
            value: {
              instances: [
                "claimName=team-data, path=/mnt/data, claimInfo.accessModes.readWriteMany=true"
              ],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.storage.pvc.instances).toEqual([
      {
        claimName: "team-data",
        path: "/mnt/data",
        claimInfo: { accessModes: { readWriteMany: true } }
      }
    ]);
  });

  it("renders itemized defaults from pasted policy YAML snippets", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageHostPath",
            sectionId: "storage",
            value: {
              instances: [
                [
                  "defaults:",
                  "  storage:",
                  "    hostPath:",
                  "      instances:",
                  "        - path: h3-path-1",
                  "          mountPath: h3-mount-1",
                  "        - path: h3-path-2",
                  "          mountPath: h3-mount-2",
                  "      attributes:",
                  "        readOnly: true"
                ].join("\n")
              ],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.storage.hostPath).toEqual({
      instances: [
        { path: "h3-path-1", mountPath: "h3-mount-1" },
        { path: "h3-path-2", mountPath: "h3-mount-2" }
      ],
      attributes: { readOnly: true }
    });
  });

  it("accepts documented itemized section casing in pasted YAML snippets", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageHostPath",
            sectionId: "storage",
            value: {
              instances: [
                [
                  "defaults:",
                  "  storage:",
                  "    hostPath:",
                  "      Instances:",
                  "        - path: h3-path-1",
                  "          mountPath: h3-mount-1",
                  "      Attributes:",
                  "        - readOnly: true"
                ].join("\n")
              ],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.storage.hostPath).toEqual({
      instances: [{ path: "h3-path-1", mountPath: "h3-mount-1" }],
      attributes: { readOnly: true }
    });
  });

  it("renders itemized rules from pasted policy YAML snippets", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "extendedResources",
            sectionId: "compute",
            value: {
              instances: ["resource=default/cpu, quantity=5"],
              attributes: []
            },
            settings: {
              attributeRules: [
                "rules:",
                "  compute:",
                "    extendedResources:",
                "      instances:",
                "        locked:",
                "          - default/cpu",
                "        canAdd: false",
                "      attributes:",
                "        quantity:",
                "          required: true"
              ].join("\n")
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.rules.compute.extendedResources).toEqual({
      instances: {
        locked: ["default/cpu"],
        canAdd: false
      },
      attributes: {
        quantity: {
          required: true
        }
      }
    });
  });

  it("renders documented itemized rule casing from pasted YAML snippets", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageHostPath",
            sectionId: "storage",
            value: {
              instances: [],
              attributes: []
            },
            settings: {
              locked: [
                "rules:",
                "  storage:",
                "    hostPath:",
                "      Instances:",
                "        locked:",
                "          - HOME",
                "          - USER"
              ].join("\n")
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.rules.storage.hostPath.instances.locked).toEqual(["HOME", "USER"]);
  });

  it("normalizes common storage key aliases in itemized inputs", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageNfs",
            sectionId: "storage",
            value: {
              instances: ["nfsServer=nfs.company.local, path=/exports/data, mountpath=/mnt/nfs, readonly=true"],
              attributes: []
            },
            settings: {}
          },
          {
            fieldId: "storagePvc",
            sectionId: "storage",
            value: {
              instances: ["claimname=team-data, path=/mnt/data, readonly=false, claimInfo.accessModes.readwriteMany=true"],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.storage.nfs.instances).toEqual([
      {
        server: "nfs.company.local",
        path: "/exports/data",
        mountPath: "/mnt/nfs",
        readOnly: true
      }
    ]);
    expect(document.defaults.storage.pvc.instances).toEqual([
      {
        claimName: "team-data",
        path: "/mnt/data",
        readOnly: false,
        claimInfo: { accessModes: { readWriteMany: true } }
      }
    ]);
  });

  it("normalizes NFS shorthand aliases to policy example item keys", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageNfs",
            sectionId: "storage",
            value: {
              instances: [
                "server=nfs.company.local, path=/exports/data, mount-propagation=HostToContainer"
              ],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.storage.nfs.instances).toEqual([
      {
        server: "nfs.company.local",
        path: "/exports/data",
        mountPropagation: "HostToContainer"
      }
    ]);
  });

  it("renders PVC storage instances with documented path key", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storagePvc",
            sectionId: "storage",
            value: {
              instances: [
                "claimName=pvc-staging-researcher1-home, existingPvc=true, path=/myhome, readOnly=false, claimInfo.accessModes.readWriteMany=true"
              ],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.storage.pvc.instances).toEqual([
      {
        claimName: "pvc-staging-researcher1-home",
        existingPvc: true,
        path: "/myhome",
        readOnly: false,
        claimInfo: { accessModes: { readWriteMany: true } }
      }
    ]);
    expect(document.defaults.storage.pvc.instances[0].mountPath).toBeUndefined();
  });

  it("renders S3 storage instances with documented item keys", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageS3",
            sectionId: "storage",
            value: {
              instances: ["bucket=my-bucket, path=/mnt/s3, url=https://s3.amazonaws.com"],
              attributes: ["bucket=shared-bucket"]
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.storage.s3.instances).toEqual([
      {
        bucket: "my-bucket",
        path: "/mnt/s3",
        url: "https://s3.amazonaws.com"
      }
    ]);
    expect(document.defaults.storage.s3.attributes).toEqual({
      bucket: "shared-bucket"
    });
    expect(document.defaults.storage.s3.instances[0].mountPath).toBeUndefined();
  });

  it("renders distributed inference storage under the selected role scope", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "distributedInference",
        selected: [
          {
            fieldId: "storagePvc",
            sectionId: "storage",
            scope: "worker",
            value: {
              instances: ["claimName=model-cache, path=/mnt/models, readOnly=true"],
              attributes: []
            },
            settings: {
              canAdd: false
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.worker.storage.pvc.instances).toEqual([
      {
        claimName: "model-cache",
        path: "/mnt/models",
        readOnly: true
      }
    ]);
    expect(document.defaults.leader).toBeUndefined();
    expect(document.rules.worker.storage.pvc.instances.canAdd).toBe(false);
  });

  it("warns when storage subtypes are not supported by the selected workload", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "distributedInference",
        selected: [
          {
            fieldId: "storageNfs",
            sectionId: "storage",
            scope: "worker",
            value: {
              instances: ["server=nfs.company.local, path=/exports/models, mountPath=/mnt/models"],
              attributes: []
            },
            settings: {}
          },
          {
            fieldId: "storageS3",
            sectionId: "storage",
            scope: "worker",
            value: {
              instances: ["bucket=models, path=/mnt/models, url=https://s3.amazonaws.com"],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toContain("Storage NFS is not supported for Distributed Inference.");
    expect(result.warnings).toContain("Storage S3 is not supported for Distributed Inference.");
    expect(document.defaults).toBeNull();
    expect(document.rules).toBeNull();
  });

  it("keeps storage identifiers and secret references as strings", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageDataVolume",
            sectionId: "storage",
            value: {
              instances: ["id=123, mountPath=/mnt/data, subPath=0"],
              attributes: []
            },
            settings: {}
          },
          {
            fieldId: "storagePvc",
            sectionId: "storage",
            value: {
              instances: [
                "claimName=team-data, path=/mnt/data, ephemeral=true, claimInfo.size=1, claimInfo.storageclass=123, claimInfo.volumeMode=Filesystem"
              ],
              attributes: []
            },
            settings: {}
          },
          {
            fieldId: "storageGit",
            sectionId: "storage",
            value: {
              instances: [
                "repository=https://github.com/org/repo, path=/repo, username=123, passwordSecret=777, secretkeyofuser=1"
              ],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.storage.dataVolume.instances).toEqual([
      {
        id: "123",
        mountPath: "/mnt/data",
        subPath: "0"
      }
    ]);
    expect(document.defaults.storage.pvc.instances).toEqual([
      {
        claimName: "team-data",
        path: "/mnt/data",
        ephemeral: true,
        claimInfo: {
          size: "1",
          storageClass: "123",
          volumeMode: "Filesystem"
        }
      }
    ]);
    expect(document.defaults.storage.git.instances).toEqual([
      {
        repository: "https://github.com/org/repo",
        path: "/repo",
        username: "123",
        passwordSecret: "777",
        secretKeyOfUser: "1"
      }
    ]);
  });

  it("renders emptyDir size limits as quantities", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageEmptyDir",
            sectionId: "storage",
            value: {
              instances: ["path=/tmp/work, medium=Memory, sizeLimit=2"],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.storage.emptyDirVolume.instances).toEqual([
      {
        path: "/tmp/work",
        medium: "Memory",
        sizeLimit: 2
      }
    ]);
  });

  it("normalizes legacy emptyDir mountPath input to the documented emptyDirVolume path", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageEmptyDir",
            sectionId: "storage",
            value: {
              instances: ["mountPath=/tmp/work, medium=Memory, sizeLimit=2"],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.storage.emptyDirVolume.instances).toEqual([
      {
        path: "/tmp/work",
        medium: "Memory",
        sizeLimit: 2
      }
    ]);
  });

  it("renders configMap and secret volume workload API item keys", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "storageConfigMapVolumes",
            sectionId: "storage",
            value: {
              instances: [
                "name=app-config-volume, configMap=app-config, mountPath=/etc/config, defaultMode=0644"
              ],
              attributes: []
            },
            settings: {}
          },
          {
            fieldId: "storageSecretVolume",
            sectionId: "storage",
            value: {
              instances: [
                "name=api-secret-volume, secretName=api-keys, mountPath=/run/secrets, defaultMode=0400"
              ],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.storage.configMapVolumes.instances).toEqual([
      {
        name: "app-config-volume",
        configMap: "app-config",
        mountPath: "/etc/config",
        defaultMode: "0644"
      }
    ]);
    expect(document.defaults.storage.secretVolume.instances).toEqual([
      {
        name: "api-secret-volume",
        secret: "api-keys",
        mountPath: "/run/secrets",
        defaultMode: "0400"
      }
    ]);
    expect(document.defaults.storage.secretVolume.instances[0].secretName).toBeUndefined();
  });

  it("renders regular ports with documented item keys", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "ports",
            sectionId: "network",
            value: {
              instances: ["container.port=8888, service-type=NodePort, external=30080, tool-type=jupyter-notebook, tool-name=Jupyter"],
              attributes: ["serviceType=ClusterIP"]
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.ports.instances).toEqual([
      {
        container: 8888,
        external: 30080,
        toolType: "jupyter-notebook",
        toolName: "Jupyter"
      }
    ]);
    expect(document.defaults.ports.attributes).toEqual({
      serviceType: "ClusterIP"
    });
  });

  it("renders regular ports container values as numbers", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "ports",
            sectionId: "network",
            value: {
              instances: ["container=8888, serviceType=ClusterIP"],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.ports.instances).toEqual([
      {
        container: 8888,
        serviceType: "ClusterIP"
      }
    ]);
  });

  it("warns when defaultFrom key-value rules omit the source field", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "cpuCoreRequest",
            sectionId: "compute",
            value: 1,
            settings: {
              defaultFrom: "factor=0.5"
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toContain("CPU Core Request defaultFrom should include field=...");
    expect(document.rules.compute.cpuCoreRequest.defaultFrom).toEqual({ factor: 0.5 });
  });

  it("warns and skips malformed itemized attribute rule lines", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "extendedResources",
            sectionId: "compute",
            value: {
              instances: ["resource=default/cpu, quantity=5"],
              attributes: []
            },
            settings: {
              attributeRules: "quantityrequired=true\nquantity.required=true"
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toContain(
      "Extended Resources attributeRules should use attribute.rule=value entries."
    );
    expect(document.rules.compute.extendedResources.attributes).toEqual({
      quantity: { required: true }
    });
    expect(result.summary.ruleCount).toBe(1);
  });

  it("does not count malformed-only attribute rules as active rules", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "extendedResources",
            sectionId: "compute",
            value: {
              instances: [],
              attributes: []
            },
            settings: {
              attributeRules: "quantityrequired=true"
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toContain(
      "Extended Resources attributeRules should use attribute.rule=value entries."
    );
    expect(document.rules).toBeNull();
    expect(result.summary.ruleCount).toBe(0);
  });

  it("places distributed training role scoped fields under the selected role", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "distributedTraining",
        selected: [
          {
            fieldId: "command",
            sectionId: "basic",
            value: "python train.py",
            settings: {
              options: "python train.py, python eval.py"
            },
            scope: "master"
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.master.command).toBe("python train.py");
    expect(document.defaults.worker).toBeUndefined();
  });

  it("skips MPI-only distributed training fields when the selected framework is not MPI", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "distributedTraining",
        selected: [
          {
            fieldId: "distributedFramework",
            sectionId: "distributed",
            value: "PyTorch",
            settings: {}
          },
          {
            fieldId: "mpiLauncherCreationPolicy",
            sectionId: "distributed",
            value: "WaitForWorkersReady",
            settings: {
              required: true
            }
          },
          {
            fieldId: "sshAuthMountPath",
            sectionId: "distributed",
            value: "/root/.ssh",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toContain("MPI Launcher Creation Policy requires Distributed Framework MPI.");
    expect(result.warnings).toContain("SSH Auth Mount Path requires Distributed Framework MPI.");
    expect(document.defaults.distributedFramework).toBe("PyTorch");
    expect(document.defaults.mpiLauncherCreationPolicy).toBeUndefined();
    expect(document.defaults.sshAuthMountPath).toBeUndefined();
    expect(document.rules).toBeNull();
  });

  it("renders framework-dependent distributed training fields when dependencies match", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "distributedTraining",
        selected: [
          {
            fieldId: "distributedFramework",
            sectionId: "distributed",
            value: "MPI",
            settings: {}
          },
          {
            fieldId: "mpiLauncherCreationPolicy",
            sectionId: "distributed",
            value: "WaitForWorkersReady",
            settings: {
              required: true
            }
          },
          {
            fieldId: "slotsPerWorker",
            sectionId: "distributed",
            value: 4,
            settings: {
              min: 1,
              max: 8
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.distributedFramework).toBe("MPI");
    expect(document.defaults.mpiLauncherCreationPolicy).toBe("WaitForWorkersReady");
    expect(document.defaults.slotsPerWorker).toBe(4);
    expect(document.rules.mpiLauncherCreationPolicy.required).toBe(true);
    expect(document.rules.slotsPerWorker).toEqual({ min: 1, max: 8 });
  });

  it("skips PyTorch-only distributed training replica fields for other frameworks", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "distributedTraining",
        selected: [
          {
            fieldId: "distributedFramework",
            sectionId: "distributed",
            value: "MPI",
            settings: {}
          },
          {
            fieldId: "minReplicas",
            sectionId: "distributed",
            value: 1,
            settings: {}
          },
          {
            fieldId: "maxReplicas",
            sectionId: "distributed",
            value: 4,
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toContain("Min Replicas requires Distributed Framework PyTorch.");
    expect(result.warnings).toContain("Max Replicas requires Distributed Framework PyTorch.");
    expect(document.defaults.minReplicas).toBeUndefined();
    expect(document.defaults.maxReplicas).toBeUndefined();
  });

  it("renders NIM service fields at the top level without unsupported warnings", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "nim",
        selected: [
          {
            fieldId: "ngcAuthSecret",
            sectionId: "basic",
            value: "ngc-api-key-secret",
            settings: {
              required: true
            }
          },
          {
            fieldId: "servingPortPort",
            sectionId: "network",
            value: 8000,
            settings: {}
          },
          {
            fieldId: "servingPortGrpcPort",
            sectionId: "network",
            value: 9000,
            settings: {}
          },
          {
            fieldId: "servingPortExposedProtocol",
            sectionId: "network",
            value: "grpc",
            settings: {}
          },
          {
            fieldId: "autoscalingScaleWindowSeconds",
            sectionId: "network",
            value: 300,
            settings: {}
          },
          {
            fieldId: "multiNodeWorkers",
            sectionId: "distributed",
            value: 3,
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.ngcAuthSecret).toBe("ngc-api-key-secret");
    expect(document.defaults.servingPort.port).toBe(8000);
    expect(document.defaults.servingPort.container).toBeUndefined();
    expect(document.defaults.servingPort.grpcPort).toBe(9000);
    expect(document.defaults.servingPort.exposedProtocol).toBe("grpc");
    expect(document.defaults.autoscaling.scaleWindowSeconds).toBe(300);
    expect(document.defaults.multiNode.workers).toBe(3);
    expect(document.rules.ngcAuthSecret.required).toBe(true);
  });

  it("normalizes legacy NIM servingPort container.port input to the NIM port field", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "nim",
        selected: [
          {
            fieldId: "servingPort",
            sectionId: "network",
            value: "container.port=8000, serviceType=ClusterIP, grpcPort=8001, exposedProtocol=http",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.servingPort).toEqual({
      port: 8000,
      serviceType: "ClusterIP",
      grpcPort: 8001,
      exposedProtocol: "http"
    });
  });

  it("warns when autoscaling metric is missing its mandatory threshold", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "autoscalingMetric",
            sectionId: "network",
            value: "throughput",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.autoscaling.metric).toBe("throughput");
    expect(result.warnings).toContain(
      "autoscaling.metricThreshold is mandatory when autoscaling.metric is specified."
    );
  });

  it("warns when inference autoscaling can scale but has no metric", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "autoscaling",
            sectionId: "network",
            value: "minReplicas=1, maxReplicas=3",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.autoscaling).toEqual({
      minReplicas: 1,
      maxReplicas: 3
    });
    expect(result.warnings).toContain(
      "autoscaling.metric is mandatory when autoscaling.minReplicas is less than autoscaling.maxReplicas."
    );
  });

  it("allows the network-activity-only autoscaling scale-to-zero special case", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "autoscaling",
            sectionId: "network",
            value: "minReplicas=0, maxReplicas=1",
            settings: {}
          }
        ]
      })
    );

    expect(result.warnings).not.toContain(
      "autoscaling.metric is mandatory when autoscaling.minReplicas is less than autoscaling.maxReplicas."
    );
  });

  it("normalizes common autoscaling key aliases in aggregate input", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "autoscaling",
            sectionId: "network",
            value: "minreplicas=1, maxreplicas=3, metric=throughput, metricthreshold=70",
            settings: {}
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toEqual([]);
    expect(document.defaults.autoscaling).toEqual({
      minReplicas: 1,
      maxReplicas: 3,
      metric: "throughput",
      metricThreshold: 70
    });
  });

  it("counts serving fields under the Serving section", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "servingPort",
            sectionId: "serving",
            value: "container.port=8000, protocol=http, authorizationType=public",
            settings: {}
          },
          {
            fieldId: "ports",
            sectionId: "network",
            value: {
              instances: ["container=8888, serviceType=ClusterIP"],
              attributes: []
            },
            settings: {}
          }
        ]
      })
    );

    expect(result.summary.sectionCounts).toEqual(
      expect.arrayContaining([
        { sectionId: "serving", label: "Serving", count: 1 },
        { sectionId: "network", label: "Network", count: 1 }
      ])
    );
  });

  it("warns when mutually exclusive serving users and groups are both selected", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "servingPortAuthorizedUsers",
            sectionId: "network",
            value: ["alice@example.com"],
            settings: {}
          },
          {
            fieldId: "servingPortAuthorizedGroups",
            sectionId: "network",
            value: ["researchers"],
            settings: {}
          }
        ]
      })
    );

    expect(result.warnings).toContain(
      "servingPort.authorizedUsers and servingPort.authorizedGroups are mutually exclusive."
    );
  });

  it("renders standard training completions and parallelism as scalar integers", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "standardTraining",
        selected: [
          {
            fieldId: "completions",
            sectionId: "lifecycle",
            value: 4,
            settings: {
              min: 1
            }
          },
          {
            fieldId: "parallelism",
            sectionId: "lifecycle",
            value: 2,
            settings: {
              max: 4
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(document.defaults.completions).toBe(4);
    expect(document.defaults.parallelism).toBe(2);
    expect(document.rules.completions.min).toBe(1);
    expect(document.rules.parallelism.max).toBe(4);
    expect(document.defaults.parallelism.instances).toBeUndefined();
  });

  it("warns and excludes fields unsupported by the selected workload", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "nim",
        selected: [
          {
            fieldId: "servingPortAuthorizedUsers",
            sectionId: "network",
            value: ["alice@example.com"],
            settings: {
              required: true
            }
          }
        ]
      })
    );

    const document = parse(result.yaml);

    expect(result.warnings).toContain("Serving Port Authorized Users is not supported for NVIDIA NIM Service.");
    expect(document.defaults).toBeNull();
    expect(document.rules).toBeNull();
  });

  it("does not emit cross-field warnings for unsupported fields", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "nim",
        selected: [
          {
            fieldId: "servingPortAuthorizedUsers",
            sectionId: "network",
            value: ["alice@example.com"],
            settings: {}
          },
          {
            fieldId: "servingPortAuthorizedGroups",
            sectionId: "network",
            value: ["researchers"],
            settings: {}
          }
        ]
      })
    );

    expect(result.warnings).toContain("Serving Port Authorized Users is not supported for NVIDIA NIM Service.");
    expect(result.warnings).toContain("Serving Port Authorized Groups is not supported for NVIDIA NIM Service.");
    expect(result.warnings).not.toContain(
      "servingPort.authorizedUsers and servingPort.authorizedGroups are mutually exclusive."
    );
  });

  it("does not count unsupported fields or rules in the generated rule summary", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "nim",
        selected: [
          {
            fieldId: "servingPortAuthorizedUsers",
            sectionId: "network",
            value: "",
            settings: {
              required: true
            }
          },
          {
            fieldId: "environmentVariables",
            sectionId: "basic",
            value: {
              instances: [],
              attributes: []
            },
            settings: {
              required: true,
              canAdd: false
            }
          }
        ]
      })
    );

    expect(result.summary.ruleCount).toBe(1);
    expect(result.warnings).toContain("Environment Variables does not support the required rule.");
    expect(result.warnings).not.toContain("Environment Variables is marked required but has no default.");
  });

  it("warns when object fields cannot parse key-value input", () => {
    const result = generatePolicy(
      buildPolicy({
        workloadType: "inference",
        selected: [
          {
            fieldId: "servingPort",
            sectionId: "network",
            value: "not-a-key-value-entry",
            settings: {}
          }
        ]
      })
    );

    expect(result.warnings).toContain(
      "Serving Port expects key=value entries, for example container.port=8000, protocol=http, authorizationType=public."
    );

    const document = parse(result.yaml);
    expect(document.defaults).toBeNull();
    expect(result.summary.renderedFieldCount).toBe(0);
    expect(result.summary.sectionCounts).toEqual([]);
    expect(result.summary.humanSummary).toContain("0 generated fields from 1 selected fields");
  });

  it("warns when itemized fields without an item key fallback receive bare instances", () => {
    const result = generatePolicy(
      buildPolicy({
        selected: [
          {
            fieldId: "environmentVariables",
            sectionId: "basic",
            value: {
              instances: ["MY_ENV"],
              attributes: ["exclude"]
            },
            settings: {}
          }
        ]
      })
    );

    expect(result.warnings).toContain("Environment Variables instances should use key=value entries.");
    expect(result.warnings).toContain("Environment Variables attributes should use key=value entries.");

    const document = parse(result.yaml);
    expect(document.defaults).toBeNull();
  });
});
