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
  storageHostPath: {
    instancesTitle: "Mount instances",
    instancesHint: "Example: path=/datasets, mountPath=/mnt/datasets, readOnly=true",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  },
  storagePvc: {
    instancesTitle: "PVC instances",
    instancesHint: "Example: claimName=team-data, mountPath=/mnt/data",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  },
  storageGit: {
    instancesTitle: "Git instances",
    instancesHint: "Example: repository=https://github.com/org/repo, revision=main, mountPath=/workspace/repo",
    attributesHint: "Shared attribute defaults. Example: revision=main"
  },
  storageS3: {
    instancesTitle: "S3 instances",
    instancesHint: "Example: bucket=my-bucket, mountPath=/mnt/s3",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  },
  storageConfigMapVolumes: {
    instancesTitle: "ConfigMap instances",
    instancesHint: "Example: name=app-config, mountPath=/etc/config",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  },
  storageSecretVolume: {
    instancesTitle: "Secret instances",
    instancesHint: "Example: secretName=api-keys, mountPath=/run/secrets",
    attributesHint: "Shared attribute defaults. Example: readOnly=true"
  }
};

function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedWorkload, setSelectedWorkload] = useState("");
  const [activeStep, setActiveStep] = useState("workload");
  const [selectedFields, setSelectedFields] = useState<SelectedField[]>([]);
  const [imposedAssets, setImposedAssets] = useState<string[]>([]);
  const [generated, setGenerated] = useState<GenerateResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const nextCatalog = await fetchCatalog();
        setCatalog(nextCatalog);
        setSelectedWorkload(nextCatalog.workloadTypes[0]?.id ?? "");
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

    setSelectedFields((current) =>
      current.filter((selected) => {
        const field = catalog.fields.find((item) => item.id === selected.fieldId);
        return field ? field.supportedWorkloads.includes(selectedWorkload) : false;
      })
    );
  }, [catalog, selectedWorkload]);

  const sections = useMemo(() => {
    if (!catalog || !selectedWorkload) {
      return [];
    }

    return catalog.sections.filter((section) =>
      catalog.fields.some(
        (field) =>
          field.sectionId === section.id &&
          field.supportedWorkloads.includes(selectedWorkload)
      )
    );
  }, [catalog, selectedWorkload]);

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
      return;
    }

    void generatePolicy({
      workloadType: selectedWorkload,
      selected: selectedFields,
      imposedAssets
    }).then(setGenerated);
  }, [imposedAssets, selectedFields, selectedWorkload]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const steps = useMemo(() => {
    if (!catalog) {
      return [];
    }

    return [
      { id: "workload", label: "Workload Type" },
      ...sections.map((section) => ({ id: section.id, label: section.label })),
      { id: reviewSection.id, label: reviewSection.label }
    ];
  }, [catalog, sections]);

  const activeSection = sections.find((section) => section.id === activeStep) ?? reviewSection;
  const workload = catalog?.workloadTypes.find((item) => item.id === selectedWorkload);
  const availableFieldCount = useMemo(() => {
    if (!catalog || !selectedWorkload) {
      return 0;
    }

    return catalog.fields.filter((field) => field.supportedWorkloads.includes(selectedWorkload)).length;
  }, [catalog, selectedWorkload]);

  const availableFields = useMemo(() => {
    if (!catalog || activeStep === "workload" || activeStep === "review") {
      return [];
    }

    return catalog.fields.filter(
      (field) =>
        field.sectionId === activeStep &&
        field.supportedWorkloads.includes(selectedWorkload) &&
        !selectedFields.some((selected) => selected.fieldId === field.id)
    );
  }, [activeStep, catalog, selectedFields, selectedWorkload]);

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
        : field.inputKind === "list"
        ? []
        : field.defaultValue !== undefined
          ? field.defaultValue
          : field.inputKind === "boolean"
            ? false
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
    const parsed = rawValue
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

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
      rawValue
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }

  async function handleCopyYaml() {
    if (!generated?.yaml) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generated.yaml);
      setCopied(true);
    } catch {
      setError("Failed to copy YAML to clipboard.");
    }
  }

  function renderValueInput(field: Field, selected: SelectedField) {
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
          onChange={(event) => updateFieldValue(field.id, Number(event.target.value))}
        />
      );
    }

    if (field.inputKind === "boolean") {
      return (
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={Boolean(selected.value)}
            onChange={(event) => updateFieldValue(field.id, event.target.checked)}
          />
          <span>{Boolean(selected.value) ? "Enabled" : "Disabled"}</span>
        </label>
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
          instancesHint: field.placeholder ?? "One instance definition per line",
          attributesHint: "Shared attribute defaults. Example: name=value"
        };

        return (
          <div className="itemized-editor">
            <label>
              <span>{guidance.instancesTitle}</span>
              <small className="muted">{guidance.instancesHint}</small>
              <textarea
                rows={4}
                value={itemizedValue.instances.join("\n")}
                placeholder={field.placeholder}
                onChange={(event) =>
                  updateItemizedFieldValue(field.id, "instances", event.target.value)
                }
              />
            </label>
            <label>
              <span>Attributes</span>
              <small className="muted">{guidance.attributesHint}</small>
              <textarea
                rows={3}
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
          rows={3}
          value={Array.isArray(selected.value) ? selected.value.join(", ") : ""}
          placeholder={field.placeholder}
          onChange={(event) =>
            updateFieldValue(
              field.id,
              event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            )
          }
        />
      );
    }

    return (
      <input
        type="text"
        value={String(selected.value)}
        placeholder={field.placeholder}
        onChange={(event) => updateFieldValue(field.id, event.target.value)}
      />
    );
  }

  function renderSettingInput(field: Field, selected: SelectedField) {
    return field.settingsSchema?.map((setting) => {
      if (setting.inputKind === "boolean") {
        return (
          <label key={setting.id} className="setting-card">
            <span>{setting.label}</span>
            <small>{setting.description}</small>
            <input
              type="checkbox"
              checked={Boolean(selected.settings[setting.id])}
              onChange={(event) => updateFieldSetting(field.id, setting.id, event.target.checked)}
            />
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
              onChange={(event) => updateFieldSetting(field.id, setting.id, Number(event.target.value))}
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
            placeholder="comma,separated,values"
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
    return <div className="empty-state full-page">Loading policy generator...</div>;
  }

  if (!catalog) {
    return <div className="empty-state full-page">Catalog unavailable. {error}</div>;
  }

  return (
    <div className="app-shell">
      <aside className="left-panel">
        <div className="brand-block">
          <p className="eyebrow">NVIDIA Run:ai</p>
          <h1>Policy studio</h1>
          <p className="muted">Policy defaults and rules.</p>
        </div>

        <div className="green-card">
          <p className="eyebrow">Reference-driven</p>
          <strong>{availableFieldCount} policy keys</strong>
          <p className="muted">
            {workload ? `${workload.label} workload에서 지원되는 key만 표시합니다.` : "Allowed keys only."}
          </p>
        </div>

        <nav className="stepper">
          {steps.map((step, index) => (
            <button
              key={step.id}
              className={`step ${activeStep === step.id ? "active" : ""}`}
              onClick={() => setActiveStep(step.id)}
              type="button"
            >
              <span>{index + 1}</span>
              <strong>{step.label}</strong>
            </button>
          ))}
        </nav>
      </aside>

      <main className="editor-panel">
        {activeStep === "workload" ? (
          <section>
            <header className="section-header">
              <div>
                <p className="eyebrow">Step 1</p>
                <h2>Choose a workload type</h2>
                <p className="muted">
                  Only supported keys are shown.
                </p>
              </div>
              <button type="button" className="primary" onClick={() => setActiveStep(sections[0]?.id ?? "review")}>
                Start building
              </button>
            </header>

            <div className="workload-grid">
              {catalog.workloadTypes.map((item: WorkloadType) => (
                <button
                  key={item.id}
                  type="button"
                  className={`workload-card ${selectedWorkload === item.id ? "selected" : ""}`}
                  onClick={() => setSelectedWorkload(item.id)}
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
          <section>
            <header className="section-header">
              <div>
                <p className="eyebrow">Final Step</p>
                <h2>Review generated YAML</h2>
                <p className="muted">Copy the final policy YAML.</p>
              </div>
              <div className="review-actions">
                <button type="button" className="secondary" onClick={handleCopyYaml} disabled={!generated?.yaml}>
                  {copied ? "Copied" : "Copy YAML"}
                </button>
              </div>
            </header>

            <div className="review-panel">
              <div className="review-card">
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
                <h3>YAML Preview</h3>
                <pre>{generated?.yaml ?? "# YAML preview will appear here"}</pre>
              </div>
            </div>
          </section>
        ) : (
          <section>
            <header className="section-header">
              <div>
                <p className="eyebrow">Section</p>
                <h2>{activeSection.label}</h2>
                <p className="muted">{activeSection.description}</p>
              </div>
            </header>

            <div className="toolbar">
              <div>
                <strong>Add policy key</strong>
                <p className="muted">Allowed keys for this workload.</p>
              </div>
              <div className="field-picker">
                {availableFields.map((field) => (
                  <button key={field.id} type="button" className="secondary" onClick={() => addField(field)}>
                    + {field.label}
                  </button>
                ))}
                {!availableFields.length && <span className="muted">No more compatible keys in this section.</span>}
              </div>
            </div>

            {activeStep === "storage" && (
              <div className="toolbar toolbar-stack">
                <div>
                  <strong>Imposed assets</strong>
                  <p className="muted">One storage datasource asset ID per line.</p>
                </div>
                <textarea
                  rows={3}
                  value={imposedAssets.join("\n")}
                  placeholder="f12c965b-44e9-4ff6-8b43-01d8f9e630cc"
                  onChange={(event) => updateImposedAssets(event.target.value)}
                />
              </div>
            )}

            <div className="field-list">
              {selectedForSection.map((selected) => {
                const field = catalog.fields.find((item) => item.id === selected.fieldId);
                if (!field) {
                  return null;
                }

                return (
                  <article className="field-card" key={field.id}>
                    <div className="field-card-header">
                      <div>
                        <h3>{field.label}</h3>
                        <p className="muted">{field.description}</p>
                      </div>
                      <button type="button" className="ghost" onClick={() => removeField(field.id)}>
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
                <div className="empty-state">
                  No keys selected yet.
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <aside className="summary-panel">
        <div className="summary-card accent-card">
          <p className="eyebrow">Selection Summary</p>
          <h2>{workload?.label ?? "Choose a workload"}</h2>
          <p className="muted">{workload?.description}</p>
          <div className="stat-grid">
            <div>
              <strong>{selectedFields.length}</strong>
              <span>Keys selected</span>
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

        <div className="summary-card">
          <h3>Rule coverage</h3>
          <div className="summary-list">
            {generated?.summary.sectionCounts.map((section) => (
              <div key={section.sectionId} className="summary-row">
                <span>{section.label}</span>
                <strong>{section.count}</strong>
              </div>
            ))}
            {!generated?.summary.sectionCounts.length && <p className="muted">Section counts update as soon as you add keys.</p>}
          </div>
          <button type="button" className="secondary wide" onClick={() => setActiveStep("review")}>
            Open Review
          </button>
        </div>

        <div className="summary-card">
          <h3>Review notes</h3>
          {error && <p className="error-text">{error}</p>}
          {generated && <p>{generated.summary.humanSummary}</p>}
        </div>
      </aside>
    </div>
  );
}

export default App;
