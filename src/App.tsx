import { useEffect, useMemo, useState } from "react";
import { fetchCatalog, generatePolicy } from "./api";
import type {
  Catalog,
  Field,
  GenerateResponse,
  ItemizedValue,
  Section,
  SelectedField,
  WorkloadType
} from "./types";

const reviewSection: Section = {
  id: "review",
  label: "Review",
  description: "Inspect the generated policy YAML and the active rule constraints."
};

const itemizedGuidance: Record<
  string,
  { instancesTitle: string; instancesHint: string; attributesHint: string }
> = {
  environmentVariables: {
    instancesTitle: "Environment variable instances",
    instancesHint: "Example: name=HF_HOME, value=/cache/hf",
    attributesHint: "Shared defaults. Example: exclude=false"
  },
  annotations: {
    instancesTitle: "Annotation instances",
    instancesHint: "Example: name=sidecar.istio.io/inject, value=false",
    attributesHint: "Shared defaults. Example: exclude=false"
  },
  labels: {
    instancesTitle: "Label instances",
    instancesHint: "Example: name=team, value=research",
    attributesHint: "Shared defaults. Example: exclude=false"
  },
  tolerations: {
    instancesTitle: "Toleration instances",
    instancesHint: "Example: key=gpu, operator=Equal, value=true, effect=NoSchedule",
    attributesHint: "Shared attribute defaults. Example: effect=NoSchedule"
  },
  ports: {
    instancesTitle: "Port instances",
    instancesHint: "Example: container=8888, toolType=jupyter-notebook, toolName=Jupyter",
    attributesHint: "Shared attribute defaults. Example: serviceType=ClusterIP"
  },
  exposedUrls: {
    instancesTitle: "Exposed URL instances",
    instancesHint: "Example: url=https://demo.company.ai",
    attributesHint: "Shared attribute defaults. Example: exclude=false"
  },
  relatedUrls: {
    instancesTitle: "Related URL instances",
    instancesHint: "Example: url=https://grafana.company.ai/run-42",
    attributesHint: "Shared attribute defaults. Example: exclude=false"
  },
  storageHostPath: {
    instancesTitle: "Mount instances",
    instancesHint: "Example: path=/datasets, mountPath=/mnt/datasets, readOnly=true",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  },
  storageDataVolume: {
    instancesTitle: "Data volume instances",
    instancesHint: "Example: id=123e4567-e89b-12d3-a456-426614174000, mountPath=/mnt/dataset, subPath=train",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  },
  storagePvc: {
    instancesTitle: "PVC instances",
    instancesHint: "Example: claimName=team-data, path=/mnt/data, claimInfo.storageClass=fast",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  },
  storageGit: {
    instancesTitle: "Git instances",
    instancesHint: "Example: repository=https://github.com/org/repo, branch=main, path=/workspace/repo",
    attributesHint: "Shared attribute defaults. Example: revision=main"
  },
  storageS3: {
    instancesTitle: "S3 instances",
    instancesHint: "Example: bucket=my-bucket, path=/mnt/s3, url=https://s3.amazonaws.com",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  },
  storageNfs: {
    instancesTitle: "NFS instances",
    instancesHint: "Example: server=nfs.company.local, path=/exports/data, mountPath=/mnt/nfs",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  },
  storageConfigMapVolumes: {
    instancesTitle: "ConfigMap instances",
    instancesHint: "Example: name=app-config, mountPath=/etc/config",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  },
  storageSecretVolume: {
    instancesTitle: "Secret instances",
    instancesHint: "Example: secret=api-keys, mountPath=/run/secrets",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  },
  storageEmptyDir: {
    instancesTitle: "EmptyDir instances",
    instancesHint: "Example: mountPath=/tmp/work, medium=Memory, sizeLimit=2Gi",
    attributesHint: "Shared attribute defaults. Example: sizeLimit=2Gi"
  },
  extendedResources: {
    instancesTitle: "Resource instances",
    instancesHint: "Example: resource=example.com/license-a, quantity=2",
    attributesHint: "Shared attribute defaults. Example: quantity=1"
  }
};

function selectedValueForField(selectedFields: SelectedField[], fieldId: string) {
  return selectedFields.find((selected) => selected.fieldId === fieldId)?.value;
}

function fieldMatchesDependencies(field: Field, selectedFields: SelectedField[]) {
  if (!field.dependsOn?.length) {
    return true;
  }

  return field.dependsOn.every((dependency) => {
    const selectedValue = selectedValueForField(selectedFields, dependency.fieldId);

    if (typeof selectedValue !== "string") {
      return false;
    }

    return dependency.values.includes(selectedValue);
  });
}

function isFieldAvailable(field: Field, workloadId: string, selectedFields: SelectedField[]) {
  return field.supportedWorkloads.includes(workloadId) && fieldMatchesDependencies(field, selectedFields);
}

function parseListInput(field: Field, rawValue: string) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return [];
  }

  if (looksLikeStructuredInput(trimmed)) {
    return trimmed;
  }

  if (field.valueType === "objectArray") {
    if (trimmed.includes("\n")) {
      return trimmed
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    if (/[=:]/.test(trimmed)) {
      return [trimmed];
    }
  }

  return rawValue
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function looksLikeStructuredInput(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("-") || /^[\w.-]+:\s/m.test(trimmed);
}

function parseTextareaLines(rawValue: string) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return [];
  }

  if (looksLikeStructuredInput(trimmed)) {
    return [trimmed];
  }

  return trimmed
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sameSelectedFields(left: SelectedField[], right: SelectedField[]) {
  return left.length === right.length && left.every((field, index) => field === right[index]);
}

function policyKeyActionLabel(action: "Add" | "Remove", fieldLabel: string) {
  return `${action} ${fieldLabel} policy key`;
}

function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedWorkload, setSelectedWorkload] = useState("");
  const [hasChosenWorkload, setHasChosenWorkload] = useState(false);
  const [activeStep, setActiveStep] = useState("workload");
  const [selectedFields, setSelectedFields] = useState<SelectedField[]>([]);
  const [imposedAssets, setImposedAssets] = useState<string[]>([]);
  const [generated, setGenerated] = useState<GenerateResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const fieldsById = useMemo(() => {
    return new Map(catalog?.fields.map((field) => [field.id, field]) ?? []);
  }, [catalog]);
  const selectedFieldIds = useMemo(() => {
    return new Set(selectedFields.map((field) => field.fieldId));
  }, [selectedFields]);

  useEffect(() => {
    async function load() {
      try {
        const nextCatalog = await fetchCatalog();
        setCatalog(nextCatalog);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load the catalog");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (!catalog || !selectedWorkload) {
      return;
    }

    setSelectedFields((current) => {
      const filtered = current.filter((selected) => {
        const field = fieldsById.get(selected.fieldId);
        return field ? isFieldAvailable(field, selectedWorkload, current) : false;
      });

      return sameSelectedFields(current, filtered) ? current : filtered;
    });
  }, [catalog, fieldsById, selectedFields, selectedWorkload]);

  const sections = useMemo(() => {
    if (!catalog || !selectedWorkload) {
      return [];
    }

    return catalog.sections.filter((section) =>
      catalog.fields.some(
        (field) =>
          field.sectionId === section.id &&
          isFieldAvailable(field, selectedWorkload, selectedFields)
      )
    );
  }, [catalog, selectedFields, selectedWorkload]);

  useEffect(() => {
    if (activeStep === "workload" || activeStep === "review") {
      return;
    }

    if (!sections.some((section) => section.id === activeStep)) {
      setActiveStep(sections[0]?.id ?? "review");
    }
  }, [activeStep, sections]);

  useEffect(() => {
    if (!selectedWorkload) {
      setGenerated(null);
      return;
    }

    let isCurrent = true;

    void generatePolicy({
      workloadType: selectedWorkload,
      selected: selectedFields,
      imposedAssets
    })
      .then((nextGenerated) => {
        if (!isCurrent) {
          return;
        }

        setGenerated(nextGenerated);
        setError("");
      })
      .catch((nextError) => {
        if (!isCurrent) {
          return;
        }

        setGenerated(null);
        setError(nextError instanceof Error ? nextError.message : "Failed to generate policy YAML.");
      });

    return () => {
      isCurrent = false;
    };
  }, [imposedAssets, selectedFields, selectedWorkload]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const steps = useMemo(() => {
    if (!catalog || !selectedWorkload) {
      return [];
    }

    return [
      { id: "workload", label: "Workload Type" },
      ...sections.map((section) => ({ id: section.id, label: section.label })),
      { id: reviewSection.id, label: reviewSection.label }
    ];
  }, [catalog, sections]);
  const activeStepNumber = Math.max(1, steps.findIndex((step) => step.id === activeStep) + 1);
  const isLanding = activeStep === "workload" && !hasChosenWorkload;

  const activeSection = useMemo(
    () => sections.find((section) => section.id === activeStep) ?? reviewSection,
    [activeStep, sections]
  );
  const workload = useMemo(
    () => catalog?.workloadTypes.find((item) => item.id === selectedWorkload),
    [catalog, selectedWorkload]
  );
  const availableFieldCount = useMemo(() => {
    if (!catalog || !selectedWorkload) {
      return 0;
    }

    return catalog.fields.filter((field) => isFieldAvailable(field, selectedWorkload, selectedFields)).length;
  }, [catalog, selectedFields, selectedWorkload]);

  const availableFields = useMemo(() => {
    if (!catalog || activeStep === "workload" || activeStep === "review") {
      return [];
    }

    return catalog.fields.filter(
      (field) =>
        field.sectionId === activeStep &&
        isFieldAvailable(field, selectedWorkload, selectedFields) &&
        !selectedFieldIds.has(field.id)
    );
  }, [activeStep, catalog, selectedFieldIds, selectedFields, selectedWorkload]);

  const selectedForSection = useMemo(() => {
    if (activeStep === "workload" || activeStep === "review") {
      return [];
    }

    return selectedFields.filter((field) => field.sectionId === activeStep);
  }, [activeStep, selectedFields]);

  function addField(field: Field) {
    const requiresScope = field.scopeByWorkload?.[selectedWorkload] === "role";
    const baseValue =
      field.valueType === "itemized"
        ? { instances: [], attributes: [] }
        : field.inputKind === "list" && (field.valueType === "array" || field.valueType === "objectArray")
        ? []
        : field.defaultValue !== undefined
          ? field.defaultValue
          : "";

    setSelectedFields((current) => [
      ...current,
      {
        fieldId: field.id,
        sectionId: field.sectionId,
        value: baseValue,
        settings: {},
        scope: requiresScope ? "all" : undefined
      }
    ]);
  }

  function updateFieldValue(fieldId: string, value: SelectedField["value"]) {
    setSelectedFields((current) =>
      current.map((field) => (field.fieldId === fieldId ? { ...field, value } : field))
    );
  }

  function updateItemizedFieldValue(
    fieldId: string,
    part: keyof ItemizedValue,
    rawValue: string
  ) {
    const parsed = parseTextareaLines(rawValue);

    setSelectedFields((current) =>
      current.map((field) => {
        if (
          field.fieldId !== fieldId ||
          typeof field.value !== "object" ||
          field.value === null ||
          Array.isArray(field.value)
        ) {
          return field;
        }

        return {
          ...field,
          value: {
            ...field.value,
            [part]: parsed
          }
        };
      })
    );
  }

  function updateFieldSetting(
    fieldId: string,
    settingId: string,
    value: string | number | boolean
  ) {
    setSelectedFields((current) =>
      current.map((field) =>
        field.fieldId === fieldId
          ? {
              ...field,
              settings: {
                ...field.settings,
                [settingId]: value
              }
            }
          : field
      )
    );
  }

  function removeField(fieldId: string) {
    setSelectedFields((current) => current.filter((field) => field.fieldId !== fieldId));
  }

  function updateFieldScope(fieldId: string, scope: string) {
    setSelectedFields((current) =>
      current.map((field) => (field.fieldId === fieldId ? { ...field, scope } : field))
    );
  }

  function updateImposedAssets(rawValue: string) {
    setImposedAssets(
      Array.from(
        new Set(
          rawValue
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        )
      )
    );
  }

  function resetPolicyDraft(nextStep = "workload") {
    setSelectedFields([]);
    setImposedAssets([]);
    setGenerated(null);
    setCopied(false);
    if (nextStep === "workload") {
      setSelectedWorkload("");
      setHasChosenWorkload(false);
    }
    setActiveStep(nextStep);
  }

  function handleStepClick(stepId: string) {
    if (stepId === "workload") {
      resetPolicyDraft("workload");
      return;
    }

    setActiveStep(stepId);
  }

  function handleWorkloadSelect(workloadId: string) {
    if (workloadId !== selectedWorkload) {
      setSelectedFields([]);
      setImposedAssets([]);
      setGenerated(null);
      setCopied(false);
    }

    setSelectedWorkload(workloadId);
    setHasChosenWorkload(true);
  }

  async function handleCopyYaml() {
    if (!generated?.yaml) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generated.yaml);
      setError("");
      setCopied(true);
    } catch {
      setError("Failed to copy YAML to clipboard.");
    }
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderValueInput(field: Field, selected: SelectedField) {
    const placeholder = field.placeholderByWorkload?.[selectedWorkload] ?? field.placeholder;

    if (field.inputKind === "select") {
      return (
        <select
          value={String(selected.value)}
          onChange={(event) => updateFieldValue(field.id, event.target.value)}
        >
          <option value="">Select an option</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (field.inputKind === "number") {
      return (
        <input
          type="number"
          value={String(selected.value)}
          onChange={(event) =>
            updateFieldValue(field.id, event.target.value === "" ? "" : Number(event.target.value))
          }
        />
      );
    }

    if (field.inputKind === "boolean") {
      const selectValue =
        typeof selected.value === "boolean" ? String(selected.value) : "";

      return (
        <select
          value={selectValue}
          onChange={(event) => {
            const value = event.target.value;
            updateFieldValue(field.id, value === "" ? "" : value === "true");
          }}
        >
          <option value=""></option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }

    if (field.inputKind === "list") {
      if (field.valueType === "itemized") {
        const itemizedValue =
          typeof selected.value === "object" && selected.value !== null && !Array.isArray(selected.value)
            ? selected.value
            : { instances: [], attributes: [] };
        const guidance = itemizedGuidance[field.id] ?? {
          instancesTitle: "Instances",
          instancesHint: placeholder ?? "One instance definition per line",
          attributesHint: "Shared attribute defaults. Example: name=value"
        };

        return (
          <div className="itemized-editor">
            <label>
              <span>{guidance.instancesTitle}</span>
              <small className="muted">{guidance.instancesHint}</small>
              <textarea
                rows={2}
                value={itemizedValue.instances.join("\n")}
                placeholder={placeholder ?? guidance.instancesHint.replace("Example: ", "")}
                onChange={(event) =>
                  updateItemizedFieldValue(field.id, "instances", event.target.value)
                }
              />
            </label>
            <label>
              <span>Attributes</span>
              <small className="muted">{guidance.attributesHint}</small>
              <textarea
                rows={1}
                value={itemizedValue.attributes.join("\n")}
                placeholder="name=value per line"
                onChange={(event) =>
                  updateItemizedFieldValue(field.id, "attributes", event.target.value)
                }
              />
            </label>
          </div>
        );
      }

      return (
        <textarea
          rows={2}
          value={Array.isArray(selected.value) ? selected.value.join(", ") : String(selected.value)}
          placeholder={placeholder}
          onChange={(event) =>
            updateFieldValue(
              field.id,
              field.valueType === "array"
                ? parseListInput(field, event.target.value)
                : field.valueType === "objectArray"
                  ? parseListInput(field, event.target.value)
                : event.target.value
            )
          }
        />
      );
    }

    return (
      <input
        type="text"
        value={String(selected.value)}
        placeholder={placeholder}
        onChange={(event) => updateFieldValue(field.id, event.target.value)}
      />
    );
  }

  function renderSettingInput(field: Field, selected: SelectedField) {
    return field.settingsSchema?.map((setting) => {
      if (setting.inputKind === "boolean") {
        const settingValue = selected.settings[setting.id];
        const selectValue =
          typeof settingValue === "boolean" ? String(settingValue) : "";

        return (
          <label key={setting.id} className="setting-card">
            <span>{setting.label}</span>
            <small>{setting.description}</small>
            <select
              value={selectValue}
              onChange={(event) => {
                const value = event.target.value;
                updateFieldSetting(field.id, setting.id, value === "" ? "" : value === "true");
              }}
            >
              <option value=""></option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
        );
      }

      if (setting.inputKind === "number") {
        return (
          <label key={setting.id} className="setting-card">
            <span>{setting.label}</span>
            <small>{setting.description}</small>
            <input
              type="number"
              value={String(selected.settings[setting.id] ?? "")}
              onChange={(event) =>
                updateFieldSetting(field.id, setting.id, event.target.value === "" ? "" : Number(event.target.value))
              }
            />
          </label>
        );
      }

      if (setting.id === "locked" || setting.id === "attributeRules") {
        return (
          <label key={setting.id} className="setting-card">
            <span>{setting.label}</span>
            <small>{setting.description}</small>
            <textarea
              rows={2}
              value={String(selected.settings[setting.id] ?? "")}
              placeholder={
                setting.id === "attributeRules"
                  ? "quantity.required=true\nurl.options=value=https://example.com"
                  : "WANDB_BASE_URL, vol-data-1"
              }
              onChange={(event) => updateFieldSetting(field.id, setting.id, event.target.value)}
            />
          </label>
        );
      }

      return (
        <label key={setting.id} className="setting-card">
          <span>{setting.label}</span>
          <small>{setting.description}</small>
          <input
            type="text"
            value={String(selected.settings[setting.id] ?? "")}
            placeholder={
              setting.id === "options"
                ? "Always, Never"
                : setting.id === "defaultFrom"
                  ? "field=compute.cpuCoreLimit, factor=0.5"
                  : "value-a, value-b"
            }
            onChange={(event) => updateFieldSetting(field.id, setting.id, event.target.value)}
          />
        </label>
      );
    });
  }

  function roleOptionsForWorkload(workloadId: string) {
    const options = catalog?.workloadTypes.find((item) => item.id === workloadId)?.scopeOptions ?? [];

    return options.map((option) => ({
      value: option,
      label:
        option === "all"
          ? "All roles"
          : option.charAt(0).toUpperCase() + option.slice(1)
    }));
  }

  if (loading) {
    return (
      <div className="empty-state full-page" role="status" aria-live="polite" aria-busy="true">
        Loading policy generator...
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="empty-state full-page" role="alert">
        Catalog unavailable. {error}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="left-panel" aria-label="Policy navigation">
        <button
          type="button"
          className="brand-block brand-button"
          aria-label="Reset policy draft"
          onClick={() => resetPolicyDraft("workload")}
        >
          <p className="eyebrow">NVIDIA Run:ai</p>
          <h1>Policy studio</h1>
          <p className="muted">Make policies more easily.</p>
        </button>

        <div className="green-card">
          <p className="eyebrow">{isLanding ? "Start here" : "Reference-driven"}</p>
          <strong>{isLanding ? "Build your own Run:ai policy." : `${availableFieldCount} policy keys`}</strong>
          <p className="muted">
            {isLanding
              ? "Select a workload type to reveal supported steps and policy keys."
              : workload
                ? `Showing keys supported by ${workload.label} workloads.`
                : "Allowed keys only."}
          </p>
        </div>

        {!isLanding && (
          <nav className="stepper" aria-label="Policy builder steps">
            {steps.map((step, index) => (
              <button
                key={step.id}
                className={`step ${activeStep === step.id ? "active" : ""}`}
                onClick={() => handleStepClick(step.id)}
                aria-current={activeStep === step.id ? "step" : undefined}
                aria-label={activeStep === step.id ? `Current step: ${step.label}` : `Go to ${step.label}`}
                type="button"
              >
                <span>{index + 1}</span>
                <strong>{step.label}</strong>
              </button>
            ))}
          </nav>
        )}
      </aside>

      <main className="editor-panel" aria-label="Policy builder">
        {activeStep === "workload" ? (
          <section aria-labelledby="policy-editor-title">
            <header className="section-header">
              <div>
                <p className="eyebrow">Step {activeStepNumber}</p>
                <h2 id="policy-editor-title">Choose a workload type</h2>
                <p className="muted">
                  {isLanding
                    ? "Build your own Run:ai policy. Select a workload type to start."
                    : "Only supported keys are shown."}
                </p>
              </div>
              <button
                type="button"
                className="primary"
                disabled={!selectedWorkload}
                onClick={() => setActiveStep(sections[0]?.id ?? "review")}
              >
                Start building
              </button>
            </header>

            <div className="workload-grid">
              {catalog.workloadTypes.map((item: WorkloadType) => (
                <button
                  key={item.id}
                  type="button"
                  className={`workload-card ${hasChosenWorkload && selectedWorkload === item.id ? "selected" : ""}`}
                  aria-label={`Select ${item.label} workload type`}
                  aria-pressed={hasChosenWorkload && selectedWorkload === item.id}
                  onClick={() => handleWorkloadSelect(item.id)}
                >
                  <h3>{item.label}</h3>
                  <p>{item.description}</p>
                  <div className="pill-row">
                    {item.highlights.map((highlight) => (
                      <span key={highlight} className="pill">
                        {highlight}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : activeStep === "review" ? (
          <section aria-labelledby="policy-editor-title">
            <header className="section-header">
              <div>
                <p className="eyebrow">Step {activeStepNumber}</p>
                <h2 id="policy-editor-title">Review generated YAML</h2>
                <p className="muted">Copy the final policy YAML.</p>
              </div>
              <div className="review-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={handleCopyYaml}
                  disabled={!generated?.yaml}
                  aria-label="Copy generated YAML preview"
                  aria-describedby="copy-yaml-status"
                >
                  {copied ? "Copied" : "Copy YAML"}
                </button>
                <span id="copy-yaml-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                  {copied ? "YAML copied to clipboard." : ""}
                </span>
              </div>
            </header>

            <div className="review-panel">
              <div className="review-card" role="status" aria-live="polite" aria-atomic="true">
                <h3>Warnings</h3>
                {generated?.warnings.length ? (
                  <ul className="warning-list">
                    {generated.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No warnings. The current selection already forms a valid starter policy.</p>
                )}
              </div>
              <div className="yaml-card">
                <h3 id="yaml-preview-title">YAML Preview</h3>
                <p id="yaml-preview-description" className="sr-only">
                  Read-only generated policy YAML. Focus this region to scroll the preview with the keyboard.
                </p>
                <pre
                  id="yaml-preview"
                  role="region"
                  aria-labelledby="yaml-preview-title"
                  aria-describedby="yaml-preview-description"
                  tabIndex={0}
                >{generated?.yaml ?? "# YAML preview will appear here"}</pre>
              </div>
            </div>
          </section>
        ) : (
          <section aria-labelledby="policy-editor-title">
            <header className="section-header">
              <div>
                <p className="eyebrow">Step {activeStepNumber}</p>
                <h2 id="policy-editor-title">{activeSection.label}</h2>
                <p className="muted">{activeSection.description}</p>
              </div>
            </header>

            <div className="toolbar add-key-toolbar">
              <div>
                <strong id="add-policy-key-title">Add policy key</strong>
                <p className="muted">Allowed keys for this workload.</p>
              </div>
              <div className="field-picker" role="group" aria-labelledby="add-policy-key-title">
                {availableFields.map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    className="secondary"
                    aria-label={policyKeyActionLabel("Add", field.label)}
                    onClick={() => addField(field)}
                  >
                    + {field.label}
                  </button>
                ))}
                {!availableFields.length && (
                  <span className="muted" role="status" aria-live="polite">
                    No more compatible keys in this section.
                  </span>
                )}
              </div>
            </div>

            {activeStep === "storage" && (
              <div className="toolbar toolbar-stack">
                <div>
                  <label htmlFor="imposed-assets-input">
                    <strong>Imposed assets</strong>
                  </label>
                  <p className="muted">One storage datasource asset ID per line.</p>
                </div>
                <textarea
                  id="imposed-assets-input"
                  rows={2}
                  value={imposedAssets.join("\n")}
                  placeholder="f12c965b-44e9-4ff6-8b43-01d8f9e630cc"
                  onChange={(event) => updateImposedAssets(event.target.value)}
                />
              </div>
            )}

            <div className="field-list">
              {selectedForSection.map((selected) => {
                const field = fieldsById.get(selected.fieldId);
                if (!field) {
                  return null;
                }

                const fieldCardTitleId = `field-card-${field.id}-title`;

                return (
                  <article className="field-card" key={field.id} aria-labelledby={fieldCardTitleId}>
                    <div className="field-card-header">
                      <div>
                        <h3 id={fieldCardTitleId}>{field.label}</h3>
                        <p className="muted">{field.description}</p>
                      </div>
                      <button
                        type="button"
                        className="ghost"
                        aria-label={policyKeyActionLabel("Remove", field.label)}
                        onClick={() => removeField(field.id)}
                      >
                        Remove
                      </button>
                    </div>

                    <div className="field-meta-grid">
                      <div>
                        <span className="field-kicker">YAML Path</span>
                        <strong>{field.yamlPath}</strong>
                      </div>
                      <div>
                        <span className="field-kicker">Field Effect</span>
                        <p>{field.impact}</p>
                      </div>
                    </div>

                    {field.valueType === "itemized" && (
                      <div className="hint-banner">
                        <strong>Itemized structure</strong>
                        <p className="muted">
                          `instances` is for default entries. `attributes` is for shared per-item defaults or rules.
                        </p>
                      </div>
                    )}

                    <label>
                      <span>Default value</span>
                      {renderValueInput(field, selected)}
                    </label>

                    {field.scopeByWorkload?.[selectedWorkload] === "role" && (
                      <label>
                        <span>Applies to</span>
                        <select
                          value={selected.scope ?? "all"}
                          onChange={(event) => updateFieldScope(field.id, event.target.value)}
                        >
                          {roleOptionsForWorkload(selectedWorkload).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {!!field.ruleHints?.length && (
                      <div className="pill-row">
                        {field.ruleHints.map((hint) => (
                          <span key={hint} className="pill subtle">
                            {hint}
                          </span>
                        ))}
                      </div>
                    )}

                    {!!field.settingsSchema?.length && <div className="settings-grid">{renderSettingInput(field, selected)}</div>}
                  </article>
                );
              })}

              {!selectedForSection.length && (
                <div className="empty-state" role="status" aria-live="polite" aria-atomic="true">
                  No keys selected yet.
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <aside className="summary-panel" aria-label="Policy summary">
        {isLanding ? (
          <div className="summary-card accent-card landing-summary">
            <p className="eyebrow">Policy builder</p>
            <h2>Build your own Run:ai policy.</h2>
            <p className="muted">Choose a workload type, then add only the defaults and rules you need.</p>
          </div>
        ) : (
          <>
            <div className="summary-card accent-card">
              <p className="eyebrow">Selection Summary</p>
              <h2>{workload?.label ?? "Choose a workload"}</h2>
              <p className="muted">{workload?.description}</p>
              <div className="stat-grid">
                <div>
                  <strong>
                    {generated
                      ? `${generated.summary.renderedFieldCount}/${generated.summary.selectedFieldCount}`
                      : selectedFields.length}
                  </strong>
                  <span>Keys generated</span>
                </div>
                <div>
                  <strong>{generated?.summary.ruleCount ?? 0}</strong>
                  <span>Rules active</span>
                </div>
                <div>
                  <strong>{generated?.summary.assetCount ?? imposedAssets.length}</strong>
                  <span>Imposed assets</span>
                </div>
              </div>
            </div>

            <div className="summary-card summary-coverage">
              <h3>Rule coverage</h3>
              {generated?.summary.sectionCounts.length ? (
                <dl className="summary-list">
                  {generated.summary.sectionCounts.map((section) => (
                    <div key={section.sectionId} className="summary-row">
                      <dt>{section.label}</dt>
                      <dd>
                        <strong>{section.count}</strong>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="muted">Step counts update as soon as valid keys render.</p>
              )}
              <button type="button" className="secondary wide" onClick={() => setActiveStep("review")}>
                Open Review
              </button>
            </div>

            <div className="summary-card summary-notes" aria-live="polite" aria-atomic="true">
              <h3>Review notes</h3>
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
              {generated && <p>{generated.summary.humanSummary}</p>}
            </div>
          </>
        )}

        <p className="version-note">
          Optimized for Run:ai 2.24.
          <br />
          <a
            href="https://run-ai-docs.nvidia.com/self-hosted/platform-management/policies/policy-yaml-reference"
            target="_blank"
            rel="noreferrer"
            aria-label="Open official Run:ai YAML reference in a new tab"
          >
            Official YAML reference
          </a>
        </p>
      </aside>
      <button
        type="button"
        className="scroll-top-button"
        aria-label="Back to top"
        title="Back to top"
        onClick={scrollToTop}
      >
        <span className="scroll-top-icon" aria-hidden="true">
          ›
        </span>
      </button>
    </div>
  );
}

export default App;
