export type WorkloadType = {
  id: string;
  label: string;
  description: string;
  highlights: string[];
  scopeOptions?: string[];
};

export type Section = {
  id: string;
  label: string;
  description: string;
};

export type FieldSetting = {
  id: string;
  label: string;
  inputKind: "boolean" | "number" | "text";
  description: string;
};

export type ItemizedValue = {
  instances: string[];
  attributes: string[];
};

export type FieldValue = string | number | string[] | boolean | ItemizedValue;

export type Field = {
  id: string;
  label: string;
  sectionId: string;
  description: string;
  impact: string;
  yamlPath: string;
  inputKind: "text" | "number" | "select" | "list" | "boolean";
  supportedWorkloads: string[];
  valueType: string;
  scopeByWorkload?: Record<string, "top-level" | "role">;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: string[];
  ruleHints?: string[];
  settingsSchema?: FieldSetting[];
};

export type Catalog = {
  workloadTypes: WorkloadType[];
  sections: Section[];
  fields: Field[];
};

export type SelectedField = {
  fieldId: string;
  sectionId: string;
  value: FieldValue;
  settings: Record<string, string | number | boolean>;
  scope?: string;
};

export type GenerateRequest = {
  workloadType: string;
  selected: SelectedField[];
  imposedAssets: string[];
};

export type GenerateResponse = {
  workloadType: string;
  yaml: string;
  warnings: string[];
  summary: {
    selectedFieldCount: number;
    ruleCount: number;
    assetCount: number;
    humanSummary: string;
    sectionCounts: Array<{
      sectionId: string;
      label: string;
      count: number;
    }>;
  };
};
