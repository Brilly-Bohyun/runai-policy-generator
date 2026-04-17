import type { Catalog, Field, FieldSetting } from "./types";

const workspace = "workspace";
const standardTraining = "standardTraining";
const distributedTraining = "distributedTraining";
const inference = "inference";
const distributedInference = "distributedInference";

const allWorkloads = [
  workspace,
  standardTraining,
  distributedTraining,
  inference,
  distributedInference
];

const exceptNim = [workspace, standardTraining, distributedTraining, inference, distributedInference];
const classicWorkloads = [workspace, standardTraining, distributedTraining, inference];
const classicWithDistributedInference = [workspace, standardTraining, distributedTraining, inference, distributedInference];
const interactiveAndTraining = [workspace, standardTraining, distributedTraining];
const servingWorkloads = [inference, distributedInference];

const booleanRuleTemplate: FieldSetting[] = [
  { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
  { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the default value." }
];

const stringRuleTemplate: FieldSetting[] = [
  { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
  { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the default value." },
  { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict the allowed values." }
];

const numericRuleTemplate: FieldSetting[] = [
  { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
  { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the default value." },
  { id: "min", label: "Min", inputKind: "number", description: "Minimum allowed value." },
  { id: "max", label: "Max", inputKind: "number", description: "Maximum allowed value." },
  { id: "step", label: "Step", inputKind: "number", description: "Allowed gap between values." },
  { id: "defaultFrom", label: "Default From", inputKind: "text", description: "Calculate a default from another field." }
];

const quantityRuleTemplate: FieldSetting[] = [
  { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
  { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the default value." },
  { id: "min", label: "Min", inputKind: "text", description: "Minimum allowed value." },
  { id: "max", label: "Max", inputKind: "text", description: "Maximum allowed value." },
  { id: "defaultFrom", label: "Default From", inputKind: "text", description: "Calculate a default from another field." }
];

const arrayRuleTemplate: FieldSetting[] = [
  { id: "required", label: "Required", inputKind: "boolean", description: "Require one or more values." },
  { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the default values." }
];

const itemizedRuleTemplate: FieldSetting[] = [
  { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow additional instances." },
  { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing or excluding the default instances." }
];

function mergeSettings(existing: FieldSetting[] | undefined, defaults: FieldSetting[]) {
  const byId = new Map<string, FieldSetting>();

  defaults.forEach((setting) => byId.set(setting.id, setting));
  existing?.forEach((setting) => byId.set(setting.id, setting));

  return Array.from(byId.values());
}

function normalizeSettings(field: Field) {
  switch (field.valueType) {
    case "boolean":
      return mergeSettings(field.settingsSchema, booleanRuleTemplate);
    case "string":
      return mergeSettings(field.settingsSchema, stringRuleTemplate);
    case "integer":
    case "number":
      return mergeSettings(field.settingsSchema, numericRuleTemplate);
    case "quantity":
      return mergeSettings(field.settingsSchema, quantityRuleTemplate);
    case "array":
      return mergeSettings(field.settingsSchema, arrayRuleTemplate);
    case "itemized":
      return mergeSettings(field.settingsSchema, itemizedRuleTemplate);
    default:
      return field.settingsSchema ?? [];
  }
}

const baseCatalog: Catalog = {
  workloadTypes: [
    {
      id: workspace,
      label: "Workspace",
      description: "Interactive development sessions with policy-driven defaults and restrictions.",
      highlights: ["Interactive access", "Authoring guardrails", "Persistent defaults"]
    },
    {
      id: standardTraining,
      label: "Standard Training",
      description: "Single-job training policies for standard submission flows.",
      highlights: ["Batch jobs", "Compute limits", "Training defaults"]
    },
    {
      id: distributedTraining,
      label: "Distributed Training",
      description: "Master and worker policy settings with distributed-only controls.",
      highlights: ["Master / worker", "Distributed rules", "Framework-aware"],
      scopeOptions: ["all", "master", "worker"]
    },
    {
      id: inference,
      label: "Inference",
      description: "Serving-oriented policies for exposed endpoints, autoscaling, and readiness.",
      highlights: ["Serving", "Autoscaling", "Access control"]
    },
    {
      id: distributedInference,
      label: "Distributed Inference",
      description: "Leader and worker policy settings for distributed inference workloads.",
      highlights: ["Leader / worker", "Serving", "API-only fields"],
      scopeOptions: ["all", "leader", "worker"]
    }
  ],
  sections: [
    {
      id: "basic",
      label: "Base Spec",
      description: "Core image, command, and metadata fields allowed for the selected workload type."
    },
    {
      id: "scheduling",
      label: "Scheduling",
      description: "Placement, priority, affinity, and preemption controls."
    },
    {
      id: "compute",
      label: "Compute",
      description: "CPU, memory, GPU, and shared-memory fields exposed in the reference."
    },
    {
      id: "storage",
      label: "Storage",
      description: "Storage-related policy keys from the reference, including mounts and volume sources."
    },
    {
      id: "network",
      label: "Network & Serving",
      description: "Exposed URLs, serving ports, autoscaling, and service configuration."
    },
    {
      id: "security",
      label: "Security",
      description: "Identity and container hardening settings."
    },
    {
      id: "lifecycle",
      label: "Lifecycle",
      description: "Restart, cleanup, retry, and terminal workload behavior."
    },
    {
      id: "distributed",
      label: "Distributed",
      description: "Distributed-only framework and replica controls."
    }
  ],
  fields: [
    {
      id: "image",
      label: "Image",
      sectionId: "basic",
      description: "Specifies the image used by the created workload.",
      impact: "Defines the runtime base for the workload and is typically one of the most important defaults.",
      yamlPath: "image",
      inputKind: "text",
      valueType: "string",
      placeholder: "nvcr.io/nvidia/pytorch:24.03-py3",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a value either from defaults or from the submission." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow submissions to override the default image." }
      ]
    },
    {
      id: "imagePullPolicy",
      label: "Image Pull Policy",
      sectionId: "basic",
      description: "Specifies the image pull policy.",
      impact: "Controls when images are fetched and can affect reproducibility and pull latency.",
      yamlPath: "imagePullPolicy",
      inputKind: "select",
      valueType: "string",
      defaultValue: "IfNotPresent",
      options: ["Always", "Never", "IfNotPresent"],
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit or inherited pull policy." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict to a subset of pull policies." }
      ]
    },
    {
      id: "command",
      label: "Command",
      sectionId: "basic",
      description: "Entry point command for the created workload.",
      impact: "Overrides the image entry point and changes what the workload executes at startup.",
      yamlPath: "command",
      inputKind: "text",
      valueType: "string",
      placeholder: "python app.py",
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [{ id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow overriding the command." }]
    },
    {
      id: "args",
      label: "Args",
      sectionId: "basic",
      description: "Arguments sent with the configured command.",
      impact: "Lets the policy steer runtime behavior without replacing the whole command template.",
      yamlPath: "args",
      inputKind: "list",
      valueType: "string",
      placeholder: "--epochs=50, --batch-size=128",
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a command argument set." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the default arguments." }
      ]
    },
    {
      id: "createHomeDir",
      label: "Create Home Dir",
      sectionId: "basic",
      description: "Controls whether a temporary home directory is created.",
      impact: "Improves interactive usability while keeping the home directory ephemeral.",
      yamlPath: "createHomeDir",
      inputKind: "boolean",
      valueType: "boolean",
      defaultValue: true,
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value for this setting." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow submissions to change it." }
      ]
    },
    {
      id: "workingDir",
      label: "Working Directory",
      sectionId: "basic",
      description: "Container working directory.",
      impact: "Changes the relative execution context for scripts and mounted files.",
      yamlPath: "workingDir",
      inputKind: "text",
      valueType: "string",
      placeholder: "/workspace/project",
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [{ id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow overriding the working directory." }]
    },
    {
      id: "environmentVariables",
      label: "Environment Variables",
      sectionId: "basic",
      description: "Environment variables applied to the workload.",
      impact: "Shapes runtime configuration and credentials wiring.",
      yamlPath: "environmentVariables",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "WANDB_API_KEY=REPLACE_ME, HF_HOME=/cache/hf",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow additional environment variable instances." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing or excluding default instances." }
      ]
    },
    {
      id: "imagePullSecrets",
      label: "Image Pull Secrets",
      sectionId: "basic",
      description: "Image pull secrets used when accessing private registries.",
      impact: "Controls private registry access for the workload runtime.",
      yamlPath: "imagePullSecrets",
      inputKind: "list",
      valueType: "array",
      placeholder: "nvcr-pull-secret, team-registry-secret",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require one or more pull secrets." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changes to the provided secret list." }
      ]
    },
    {
      id: "annotations",
      label: "Annotations",
      sectionId: "basic",
      description: "Annotations applied to the workload.",
      impact: "Useful for integrations and runtime annotations that need to travel with the workload.",
      yamlPath: "annotations",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "sidecar.istio.io/inject=false, team=vision",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow additional annotation instances." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing or excluding default instances." }
      ]
    },
    {
      id: "labels",
      label: "Labels",
      sectionId: "basic",
      description: "Labels applied to the workload.",
      impact: "Improves grouping and downstream policy matching.",
      yamlPath: "labels",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "team=ml-platform, env=prod",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow additional label instances." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing or excluding default instances." }
      ]
    },
    {
      id: "category",
      label: "Category",
      sectionId: "basic",
      description: "Specifies the workload category.",
      impact: "Changes how the workload is grouped and interpreted in the platform.",
      yamlPath: "category",
      inputKind: "text",
      valueType: "string",
      placeholder: "research",
      supportedWorkloads: allWorkloads,
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a category value." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict category values." }
      ]
    },
    {
      id: "nodeType",
      label: "Node Type",
      sectionId: "scheduling",
      description: "Selects which node type should run the workload.",
      impact: "Strongly influences infrastructure selection and cost profile.",
      yamlPath: "nodeType",
      inputKind: "text",
      valueType: "string",
      placeholder: "gpu-l40s",
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a node type." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the node type." }
      ]
    },
    {
      id: "nodePools",
      label: "Node Pools",
      sectionId: "scheduling",
      description: "Ordered list of allowed node pools.",
      impact: "Provides scheduling fallback order and placement guidance.",
      yamlPath: "nodePools",
      inputKind: "list",
      valueType: "array",
      placeholder: "gpu-a100, gpu-l40s",
      supportedWorkloads: allWorkloads,
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require at least one node pool." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the node pool list." }
      ]
    },
    {
      id: "priorityClass",
      label: "Priority Class",
      sectionId: "scheduling",
      description: "Priority class for scheduling behavior.",
      impact: "Affects scheduling precedence and preemption outcomes.",
      yamlPath: "priorityClass",
      inputKind: "select",
      valueType: "string",
      defaultValue: "medium",
      options: ["very-low", "low", "medium-low", "medium", "medium-high", "high", "very-high"],
      supportedWorkloads: allWorkloads,
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a valid priority class." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict the allowed priority classes." }
      ]
    },
    {
      id: "preemptibility",
      label: "Preemptibility",
      sectionId: "scheduling",
      description: "Controls whether the workload may be preempted.",
      impact: "Defines whether the workload yields capacity to higher-priority jobs.",
      yamlPath: "preemptibility",
      inputKind: "select",
      valueType: "string",
      defaultValue: "preemptible",
      options: ["preemptible", "non-preemptible"],
      supportedWorkloads: allWorkloads,
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a chosen preemptibility." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict the preemptibility options." }
      ]
    },
    {
      id: "nodeAffinityRequired",
      label: "Node Affinity Required",
      sectionId: "scheduling",
      description: "Required node affinity constraints.",
      impact: "Hard constraints can prevent scheduling until matching nodes are available.",
      yamlPath: "nodeAffinityRequired",
      inputKind: "list",
      valueType: "array",
      placeholder: "node.kubernetes.io/instance-type=g5.4xlarge",
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require one or more affinity clauses." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the affinity constraints." }
      ]
    },
    {
      id: "tolerations",
      label: "Tolerations",
      sectionId: "scheduling",
      description: "Tolerations applied to the workload pods.",
      impact: "Allows workloads to land on tainted or specialized nodes.",
      yamlPath: "tolerations",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "gpu=true:NoSchedule, dedicated=ml:NoExecute",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow additional toleration instances." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing or excluding default instances." }
      ]
    },
    {
      id: "cpuCoreRequest",
      label: "CPU Core Request",
      sectionId: "compute",
      description: "Requested number of CPU cores.",
      impact: "Sets the workload's CPU baseline and affects scheduling fit.",
      yamlPath: "compute.cpuCoreRequest",
      inputKind: "number",
      valueType: "number",
      defaultValue: 1,
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a CPU request." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum CPU request." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum CPU request." },
        { id: "step", label: "Step", inputKind: "number", description: "Allowed gap between values." },
        { id: "defaultFrom", label: "Default From", inputKind: "text", description: "Calculate a default from another field." }
      ]
    },
    {
      id: "gpuDeviceRequest",
      label: "GPU Device Request",
      sectionId: "compute",
      description: "Requested number of GPUs for the workload.",
      impact: "Strongly determines GPU allocation and cost.",
      yamlPath: "compute.gpuDeviceRequest",
      inputKind: "number",
      valueType: "integer",
      defaultValue: 1,
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a GPU device request." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum GPU count." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum GPU count." },
        { id: "step", label: "Step", inputKind: "number", description: "Allowed gap between values." },
        { id: "defaultFrom", label: "Default From", inputKind: "text", description: "Calculate a default from another field." }
      ]
    },
    {
      id: "gpuRequestType",
      label: "GPU Request Type",
      sectionId: "compute",
      description: "Specifies whether the GPU request is by device or portion.",
      impact: "Changes how GPU allocation is interpreted by the workload runtime.",
      yamlPath: "compute.gpuRequestType",
      inputKind: "select",
      valueType: "string",
      options: ["device", "portion"],
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a GPU request type." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict the request type." }
      ]
    },
    {
      id: "largeShmRequest",
      label: "Large SHM Request",
      sectionId: "compute",
      description: "Enables a larger shared memory allocation.",
      impact: "Useful for workloads that rely heavily on shared memory.",
      yamlPath: "compute.largeShmRequest",
      inputKind: "boolean",
      valueType: "boolean",
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value for SHM behavior." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow toggling this setting." }
      ]
    },
    {
      id: "extendedResources",
      label: "Extended Resources",
      sectionId: "compute",
      description: "Extended resource requests exposed through the compute section.",
      impact: "Lets the policy define additional named resources and per-resource quantities.",
      yamlPath: "compute.extendedResources",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "resource=example.com/license-a, quantity=2",
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow additional resource instances beyond the defaults." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing or excluding the listed resource instances." }
      ]
    },
    {
      id: "cpuCoreLimit",
      label: "CPU Core Limit",
      sectionId: "compute",
      description: "Maximum number of CPU cores the workload may consume.",
      impact: "Caps CPU burst usage and limits container-side CPU consumption.",
      yamlPath: "compute.cpuCoreLimit",
      inputKind: "number",
      valueType: "number",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a CPU limit." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum CPU limit." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum CPU limit." },
        { id: "step", label: "Step", inputKind: "number", description: "Allowed gap between values." },
        { id: "defaultFrom", label: "Default From", inputKind: "text", description: "Calculate a default from another field." }
      ]
    },
    {
      id: "cpuMemoryRequest",
      label: "CPU Memory Request",
      sectionId: "compute",
      description: "Requested memory quantity for the workload.",
      impact: "Sets the guaranteed memory baseline and affects scheduling fit.",
      yamlPath: "compute.cpuMemoryRequest",
      inputKind: "text",
      valueType: "quantity",
      placeholder: "20G",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a memory request." },
        { id: "min", label: "Min", inputKind: "text", description: "Minimum memory request." },
        { id: "max", label: "Max", inputKind: "text", description: "Maximum memory request." },
        { id: "defaultFrom", label: "Default From", inputKind: "text", description: "Calculate a default from another field." }
      ]
    },
    {
      id: "cpuMemoryLimit",
      label: "CPU Memory Limit",
      sectionId: "compute",
      description: "Maximum memory quantity the workload may consume.",
      impact: "Caps memory usage and can trigger OOM behavior if set too low.",
      yamlPath: "compute.cpuMemoryLimit",
      inputKind: "text",
      valueType: "quantity",
      placeholder: "30G",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a memory limit." },
        { id: "min", label: "Min", inputKind: "text", description: "Minimum memory limit." },
        { id: "max", label: "Max", inputKind: "text", description: "Maximum memory limit." },
        { id: "defaultFrom", label: "Default From", inputKind: "text", description: "Calculate a default from another field." }
      ]
    },
    {
      id: "gpuPortionRequest",
      label: "GPU Portion Request",
      sectionId: "compute",
      description: "Requested GPU portion value when using portion-based allocation.",
      impact: "Controls fractional GPU allocation for compatible workloads.",
      yamlPath: "compute.gpuPortionRequest",
      inputKind: "number",
      valueType: "number",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a GPU portion request." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum GPU portion." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum GPU portion." },
        { id: "step", label: "Step", inputKind: "number", description: "Allowed gap between values." },
        { id: "defaultFrom", label: "Default From", inputKind: "text", description: "Calculate a default from another field." }
      ]
    },
    {
      id: "gpuPortionLimit",
      label: "GPU Portion Limit",
      sectionId: "compute",
      description: "Maximum GPU portion allowed for the workload.",
      impact: "Caps fractional GPU usage when sharing GPU capacity.",
      yamlPath: "compute.gpuPortionLimit",
      inputKind: "number",
      valueType: "number",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a GPU portion limit." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum GPU portion limit." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum GPU portion limit." },
        { id: "step", label: "Step", inputKind: "number", description: "Allowed gap between values." },
        { id: "defaultFrom", label: "Default From", inputKind: "text", description: "Calculate a default from another field." }
      ]
    },
    {
      id: "gpuMemoryRequest",
      label: "GPU Memory Request",
      sectionId: "compute",
      description: "Requested GPU memory quantity.",
      impact: "Sets the GPU memory baseline for compatible allocation strategies.",
      yamlPath: "compute.gpuMemoryRequest",
      inputKind: "text",
      valueType: "quantity",
      placeholder: "10G",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a GPU memory request." },
        { id: "min", label: "Min", inputKind: "text", description: "Minimum GPU memory request." },
        { id: "max", label: "Max", inputKind: "text", description: "Maximum GPU memory request." },
        { id: "defaultFrom", label: "Default From", inputKind: "text", description: "Calculate a default from another field." }
      ]
    },
    {
      id: "gpuMemoryLimit",
      label: "GPU Memory Limit",
      sectionId: "compute",
      description: "Maximum GPU memory quantity for the workload.",
      impact: "Caps GPU memory use for workloads that support memory-based allocation.",
      yamlPath: "compute.gpuMemoryLimit",
      inputKind: "text",
      valueType: "quantity",
      placeholder: "12G",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a GPU memory limit." },
        { id: "min", label: "Min", inputKind: "text", description: "Minimum GPU memory limit." },
        { id: "max", label: "Max", inputKind: "text", description: "Maximum GPU memory limit." },
        { id: "defaultFrom", label: "Default From", inputKind: "text", description: "Calculate a default from another field." }
      ]
    },
    {
      id: "storageHostPath",
      label: "Storage Host Path",
      sectionId: "storage",
      description: "Host path volume mount definitions.",
      impact: "Maps host filesystem paths into the workload and should be tightly controlled.",
      yamlPath: "storage.hostPath",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "path=/datasets, mountPath=/mnt/datasets, readOnly=true",
      supportedWorkloads: classicWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow extra storage instances." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing default storage instances." }
      ]
    },
    {
      id: "storageDataVolume",
      label: "Storage Data Volume",
      sectionId: "storage",
      description: "Datasource-backed data volume mounts.",
      impact: "Connects curated datasource assets to workload mount points.",
      yamlPath: "storage.dataVolume",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "mountPath=/mnt/dataset, subPath=train",
      supportedWorkloads: classicWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow extra data volume instances." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing default data volume instances." }
      ]
    },
    {
      id: "storagePvc",
      label: "Storage PVC",
      sectionId: "storage",
      description: "Persistent volume claim mounts.",
      impact: "Connects workloads to existing persistent volumes.",
      yamlPath: "storage.pvc",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "claimName=team-data, mountPath=/mnt/data",
      supportedWorkloads: classicWithDistributedInference,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow extra PVC instances." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing default PVC instances." }
      ]
    },
    {
      id: "storageGit",
      label: "Storage Git",
      sectionId: "storage",
      description: "Git repository mounts.",
      impact: "Provides repository-backed content directly in the workload filesystem.",
      yamlPath: "storage.git",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "repository=https://github.com/org/repo, revision=main, mountPath=/workspace/repo",
      supportedWorkloads: classicWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow extra git mounts." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing default git mounts." }
      ]
    },
    {
      id: "storageS3",
      label: "Storage S3",
      sectionId: "storage",
      description: "S3-backed volume mounts.",
      impact: "Makes object storage available as mounted data inside the workload.",
      yamlPath: "storage.s3",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "bucket=my-bucket, mountPath=/mnt/s3",
      supportedWorkloads: [workspace, standardTraining, distributedTraining],
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow extra S3 mounts." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing default S3 mounts." }
      ]
    },
    {
      id: "storageNfs",
      label: "Storage NFS",
      sectionId: "storage",
      description: "NFS-backed volume mounts.",
      impact: "Connects shared network file systems to workloads.",
      yamlPath: "storage.nfs",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "server=nfs.company.local, path=/exports/data, mountPath=/mnt/nfs",
      supportedWorkloads: classicWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow extra NFS mounts." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing default NFS mounts." }
      ]
    },
    {
      id: "storageConfigMapVolumes",
      label: "Storage ConfigMap Volumes",
      sectionId: "storage",
      description: "ConfigMap-backed volume mounts.",
      impact: "Injects configuration files from cluster-managed ConfigMaps.",
      yamlPath: "storage.configMapVolumes",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "name=app-config, mountPath=/etc/config",
      supportedWorkloads: classicWithDistributedInference,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow extra ConfigMap volumes." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing default ConfigMap volumes." }
      ]
    },
    {
      id: "storageSecretVolume",
      label: "Storage Secret Volume",
      sectionId: "storage",
      description: "Secret-backed volume mounts.",
      impact: "Mounts sensitive data and should usually be treated as locked defaults.",
      yamlPath: "storage.secretVolume",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "secretName=api-keys, mountPath=/run/secrets",
      supportedWorkloads: classicWithDistributedInference,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow extra secret volumes." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing default secret volumes." }
      ]
    },
    {
      id: "storageEmptyDir",
      label: "Storage EmptyDir",
      sectionId: "storage",
      description: "Ephemeral emptyDir volumes mounted into the workload.",
      impact: "Provides scratch space that lives for the lifetime of the pod.",
      yamlPath: "storage.emptyDir",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "mountPath=/tmp/work, medium=Memory",
      supportedWorkloads: classicWithDistributedInference,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow extra emptyDir volumes." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing default emptyDir volumes." }
      ]
    },
    {
      id: "servingPortContainerPort",
      label: "Serving Port Container Port",
      sectionId: "network",
      description: "Container port exposed by the serving endpoint.",
      impact: "Defines the internal serving port for traffic routing.",
      yamlPath: "servingPort.container.port",
      inputKind: "number",
      valueType: "integer",
      placeholder: "8000",
      supportedWorkloads: servingWorkloads,
      scopeByWorkload: {
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an exposed serving port." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum container port." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum container port." }
      ]
    },
    {
      id: "servingPortProtocol",
      label: "Serving Port Protocol",
      sectionId: "network",
      description: "Protocol used by the serving port.",
      impact: "Changes how clients communicate with the inference endpoint.",
      yamlPath: "servingPort.protocol",
      inputKind: "select",
      valueType: "string",
      options: ["http", "grpc"],
      supportedWorkloads: [inference, distributedInference],
      scopeByWorkload: {
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a protocol." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict the serving protocol." }
      ]
    },
    {
      id: "servingPortAuthorizationType",
      label: "Serving Port Authorization Type",
      sectionId: "network",
      description: "Authorization mode for serving URL access.",
      impact: "Controls whether serving access is public or restricted to specific users or groups.",
      yamlPath: "servingPort.authorizationType",
      inputKind: "select",
      valueType: "string",
      options: ["public", "authenticatedUsers", "authorizedUsersOrGroups"],
      supportedWorkloads: [inference, distributedInference],
      scopeByWorkload: {
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an authorization mode." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict authorization modes." }
      ]
    },
    {
      id: "servingPortAuthorizedUsers",
      label: "Serving Port Authorized Users",
      sectionId: "network",
      description: "Users allowed to access the serving URL.",
      impact: "Restricts serving access to an explicit user allowlist.",
      yamlPath: "servingPort.authorizedUsers",
      inputKind: "list",
      valueType: "array",
      placeholder: "alice, bob",
      supportedWorkloads: [inference, distributedInference],
      scopeByWorkload: {
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an allowlist if selected." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the user allowlist." }
      ]
    },
    {
      id: "servingPortAuthorizedGroups",
      label: "Serving Port Authorized Groups",
      sectionId: "network",
      description: "Groups allowed to access the serving URL.",
      impact: "Restricts serving access to an explicit group allowlist.",
      yamlPath: "servingPort.authorizedGroups",
      inputKind: "list",
      valueType: "array",
      placeholder: "ml-admins, product-owners",
      supportedWorkloads: [inference, distributedInference],
      scopeByWorkload: {
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a group allowlist if selected." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the group allowlist." }
      ]
    },
    {
      id: "servingPortExposeExternally",
      label: "Serving Port Expose Externally",
      sectionId: "network",
      description: "Whether the distributed inference serving URL is exposed externally.",
      impact: "Controls whether the generated serving endpoint is externally reachable.",
      yamlPath: "servingPort.exposeExternally",
      inputKind: "boolean",
      valueType: "boolean",
      supportedWorkloads: [distributedInference],
      scopeByWorkload: {
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit external exposure mode." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing external exposure." }
      ]
    },
    {
      id: "servingPortExposedUrl",
      label: "Serving Port Exposed URL",
      sectionId: "network",
      description: "Preferred exposed URL for distributed inference serving.",
      impact: "Lets administrators set a stable externally-facing serving URL.",
      yamlPath: "servingPort.exposedUrl",
      inputKind: "text",
      valueType: "string",
      placeholder: "https://inference.company.ai",
      supportedWorkloads: [distributedInference],
      scopeByWorkload: {
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an exposed URL if externally exposed." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the exposed URL." }
      ]
    },
    {
      id: "servingPortClusterLocalAccessOnly",
      label: "Serving Port Cluster Local Only",
      sectionId: "network",
      description: "Whether the serving URL is only available on the cluster-local network.",
      impact: "Restricts exposure to internal cluster traffic.",
      yamlPath: "servingPort.clusterLocalAccessOnly",
      inputKind: "boolean",
      valueType: "boolean",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the value." }
      ]
    },
    {
      id: "autoscalingMinReplicas",
      label: "Autoscaling Min Replicas",
      sectionId: "network",
      description: "Minimum replica count for autoscaling.",
      impact: "Defines the autoscaling floor and whether scale-to-zero is possible.",
      yamlPath: "autoscaling.minReplicas",
      inputKind: "number",
      valueType: "integer",
      defaultValue: 1,
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a minimum replica count." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum allowed value." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum allowed value." }
      ]
    },
    {
      id: "autoscalingMaxReplicas",
      label: "Autoscaling Max Replicas",
      sectionId: "network",
      description: "Maximum replica count for autoscaling.",
      impact: "Caps autoscaling growth under traffic spikes.",
      yamlPath: "autoscaling.maxReplicas",
      inputKind: "number",
      valueType: "integer",
      defaultValue: 5,
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a maximum replica count." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum allowed value." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum allowed value." }
      ]
    },
    {
      id: "autoscalingMetricThreshold",
      label: "Autoscaling Metric Threshold",
      sectionId: "network",
      description: "Metric threshold used for autoscaling.",
      impact: "Changes how aggressively inference services scale with load.",
      yamlPath: "autoscaling.metricThreshold",
      inputKind: "number",
      valueType: "number",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a metric threshold." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum threshold." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum threshold." }
      ]
    },
    {
      id: "autoscalingMetricThresholdPercentage",
      label: "Autoscaling Metric Threshold Percentage",
      sectionId: "network",
      description: "Percentage of the threshold value used by autoscaling.",
      impact: "Adjusts autoscaling sensitivity for supported inference metrics.",
      yamlPath: "autoscaling.metricThresholdPercentage",
      inputKind: "number",
      valueType: "number",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a threshold percentage." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum percentage." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum percentage." }
      ]
    },
    {
      id: "autoscalingInitialReplicas",
      label: "Autoscaling Initial Replicas",
      sectionId: "network",
      description: "Initial replica count when the workload is created for the first time.",
      impact: "Controls the initial serving footprint before autoscaling reacts.",
      yamlPath: "autoscaling.initialReplicas",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an initial replica count." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum initial replica count." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum initial replica count." }
      ]
    },
    {
      id: "autoscalingActivationReplicas",
      label: "Autoscaling Activation Replicas",
      sectionId: "network",
      description: "Replica count used when scaling up from zero.",
      impact: "Controls how many replicas appear immediately after a scale-from-zero event.",
      yamlPath: "autoscaling.activationReplicas",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an activation replica count." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum activation replica count." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum activation replica count." }
      ]
    },
    {
      id: "autoscalingConcurrencyHardLimit",
      label: "Autoscaling Concurrency Hard Limit",
      sectionId: "network",
      description: "Maximum number of requests allowed per replica.",
      impact: "Caps per-replica traffic and influences scaling pressure.",
      yamlPath: "autoscaling.concurrencyHardLimit",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a concurrency hard limit." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum concurrency limit." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum concurrency limit." }
      ]
    },
    {
      id: "autoscalingScaleToZeroRetentionSeconds",
      label: "Autoscaling Scale-To-Zero Retention Seconds",
      sectionId: "network",
      description: "Minimum time the last replica stays active after a scale-to-zero decision.",
      impact: "Avoids overly aggressive scale-to-zero behavior for bursty traffic.",
      yamlPath: "autoscaling.scaleToZeroRetentionSeconds",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a retention interval." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum retention interval." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum retention interval." }
      ]
    },
    {
      id: "autoscalingScaleDownDelaySeconds",
      label: "Autoscaling Scale Down Delay Seconds",
      sectionId: "network",
      description: "Minimum time a replica remains active after a scale-down decision.",
      impact: "Reduces oscillation by slowing down rapid scale-down behavior.",
      yamlPath: "autoscaling.scaleDownDelaySeconds",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a scale-down delay." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum delay." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum delay." }
      ]
    },
    {
      id: "autoscalingMetric",
      label: "Autoscaling Metric",
      sectionId: "network",
      description: "Metric used for autoscaling decisions.",
      impact: "Defines the autoscaling signal such as throughput, concurrency, latency, or a custom metric.",
      yamlPath: "autoscaling.metric",
      inputKind: "text",
      valueType: "string",
      placeholder: "throughput",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an autoscaling metric." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict allowed metrics, for example throughput, concurrency, latency." }
      ]
    },
    {
      id: "servingConfigurationInitializationTimeoutSeconds",
      label: "Serving Init Timeout",
      sectionId: "network",
      description: "Maximum initialization time before inference is marked failed.",
      impact: "Controls how long cold starts may take before they are treated as failed.",
      yamlPath: "servingConfiguration.initializationTimeoutSeconds",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an initialization timeout." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum timeout." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum timeout." }
      ]
    },
    {
      id: "servingConfigurationRequestTimeoutSeconds",
      label: "Serving Request Timeout",
      sectionId: "network",
      description: "Maximum request processing time before the request is ignored.",
      impact: "Sets an upper bound for per-request latency.",
      yamlPath: "servingConfiguration.requestTimeoutSeconds",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a request timeout." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum timeout." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum timeout." }
      ]
    },
    {
      id: "ports",
      label: "Ports",
      sectionId: "network",
      description: "Ports exposed from the workload.",
      impact: "Defines reachable network surfaces for the workload.",
      yamlPath: "ports",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "container.port=8888, serviceType=NodePort",
      supportedWorkloads: classicWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow additional port instances." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing or excluding default port instances." }
      ]
    },
    {
      id: "exposedUrls",
      label: "Exposed URLs",
      sectionId: "network",
      description: "User-facing URLs exported by the workload.",
      impact: "Controls which endpoints are exposed to users.",
      yamlPath: "exposedUrls",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "https://demo.example.ai",
      supportedWorkloads: classicWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow additional exposed URL instances." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing or excluding default URL instances." }
      ]
    },
    {
      id: "relatedUrls",
      label: "Related URLs",
      sectionId: "network",
      description: "Related stats or logging URLs.",
      impact: "Adds supporting links without changing serving behavior.",
      yamlPath: "relatedUrls",
      inputKind: "list",
      valueType: "itemized",
      placeholder: "https://grafana.example.ai/run-42",
      supportedWorkloads: classicWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "canAdd", label: "Can Add", inputKind: "boolean", description: "Allow additional related URL instances." },
        { id: "locked", label: "Locked", inputKind: "boolean", description: "Prevent editing or excluding default instances." }
      ]
    },
    {
      id: "probes",
      label: "Probes",
      sectionId: "network",
      description: "Readiness or liveness probe configuration.",
      impact: "Controls when traffic is allowed to reach the workload.",
      yamlPath: "probes",
      inputKind: "list",
      valueType: "array",
      placeholder: "readiness.path=/healthz, readiness.port=8080",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require probe configuration." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the defaults." }
      ]
    },
    {
      id: "servingPort",
      label: "Serving Port",
      sectionId: "network",
      description: "Serving endpoint configuration for inference-like workloads.",
      impact: "Defines the main inference service endpoint shape.",
      yamlPath: "servingPort",
      inputKind: "list",
      valueType: "array",
      placeholder: "container.port=8000, protocol=http, authorizationType=public",
      supportedWorkloads: servingWorkloads,
      scopeByWorkload: {
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require serving port configuration." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the serving defaults." }
      ]
    },
    {
      id: "autoscaling",
      label: "Autoscaling",
      sectionId: "network",
      description: "Autoscaling configuration for supported serving workloads.",
      impact: "Controls scaling floor, ceiling, and scaling strategy.",
      yamlPath: "autoscaling",
      inputKind: "list",
      valueType: "array",
      placeholder: "minReplicas=1, maxReplicas=5, metricThreshold=70",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require autoscaling configuration." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing autoscaling defaults." }
      ]
    },
    {
      id: "servingConfiguration",
      label: "Serving Configuration",
      sectionId: "network",
      description: "Inference serving timeout configuration.",
      impact: "Adjusts request and initialization timeout behavior.",
      yamlPath: "servingConfiguration",
      inputKind: "list",
      valueType: "array",
      placeholder: "initializationTimeoutSeconds=600, requestTimeoutSeconds=120",
      supportedWorkloads: [inference],
      settingsSchema: [
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing serving timeout defaults." }
      ]
    },
    {
      id: "runAsUid",
      label: "Run As UID",
      sectionId: "security",
      description: "Unix user ID for the container.",
      impact: "Defines runtime identity and affects file permissions.",
      yamlPath: "security.runAsUid",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit UID." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum UID." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum UID." }
      ]
    },
    {
      id: "runasGid",
      label: "Run As GID",
      sectionId: "security",
      description: "Unix group ID for the container.",
      impact: "Works with the UID to define filesystem group permissions.",
      yamlPath: "security.runasGid",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: allWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit GID." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum GID." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum GID." }
      ]
    },
    {
      id: "uidGidSource",
      label: "UID/GID Source",
      sectionId: "security",
      description: "Source used to determine UID and GID values.",
      impact: "Controls how container user identity is resolved.",
      yamlPath: "security.uidGidSource",
      inputKind: "select",
      valueType: "string",
      defaultValue: "fromTheImage",
      options: ["fromTheImage", "custom", "fromIdpToken"],
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a source value." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict allowed identity sources." }
      ]
    },
    {
      id: "runAsNonRoot",
      label: "Run As Non Root",
      sectionId: "security",
      description: "Whether the container must run as a non-root user.",
      impact: "Improves container hardening but may break root-dependent images.",
      yamlPath: "security.runAsNonRoot",
      inputKind: "boolean",
      valueType: "boolean",
      defaultValue: true,
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing this hardening default." }
      ]
    },
    {
      id: "allowPrivilegeEscalation",
      label: "Allow Privilege Escalation",
      sectionId: "security",
      description: "Allows launched processes to gain extra privileges.",
      impact: "This is a security-sensitive setting and should be used carefully.",
      yamlPath: "security.allowPrivilegeEscalation",
      inputKind: "boolean",
      valueType: "boolean",
      supportedWorkloads: [workspace, standardTraining, distributedTraining],
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changes to this security setting." }
      ]
    },
    {
      id: "restartPolicy",
      label: "Restart Policy",
      sectionId: "lifecycle",
      description: "Restart policy applied to the workload.",
      impact: "Defines failure recovery behavior after exits or crashes.",
      yamlPath: "restartPolicy",
      inputKind: "select",
      valueType: "string",
      options: ["Always", "Never", "OnFailure"],
      supportedWorkloads: [workspace, standardTraining, distributedTraining, distributedInference],
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a restart policy." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict restart policy values." }
      ]
    },
    {
      id: "terminateAfterPreemtpion",
      label: "Terminate After Preemption",
      sectionId: "lifecycle",
      description: "Terminate the workload after preemption.",
      impact: "Avoids partial resumes after preemption events.",
      yamlPath: "terminateAfterPreemtpion",
      inputKind: "boolean",
      valueType: "boolean",
      supportedWorkloads: interactiveAndTraining,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing this behavior." }
      ]
    },
    {
      id: "backoffLimit",
      label: "Backoff Limit",
      sectionId: "lifecycle",
      description: "Number of retries before marking the workload failed.",
      impact: "Controls failure tolerance for startup and runtime issues.",
      yamlPath: "backoffLimit",
      inputKind: "number",
      valueType: "integer",
      defaultValue: 3,
      supportedWorkloads: interactiveAndTraining,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a retry limit." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum retry count." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum retry count." }
      ]
    },
    {
      id: "tty",
      label: "TTY",
      sectionId: "lifecycle",
      description: "Whether to allocate a TTY.",
      impact: "Useful for interactive sessions and terminal-oriented tooling.",
      yamlPath: "tty",
      inputKind: "boolean",
      valueType: "boolean",
      supportedWorkloads: interactiveAndTraining,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing TTY allocation." }
      ]
    },
    {
      id: "stdin",
      label: "STDIN",
      sectionId: "lifecycle",
      description: "Whether to keep stdin open.",
      impact: "Helps interactive tools remain attached to input streams.",
      yamlPath: "stdin",
      inputKind: "boolean",
      valueType: "boolean",
      supportedWorkloads: interactiveAndTraining,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing stdin behavior." }
      ]
    },
    {
      id: "completions",
      label: "Completions",
      sectionId: "lifecycle",
      description: "Number of successful pods needed for completion.",
      impact: "Defines the completion target for standard training jobs.",
      yamlPath: "completions",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [standardTraining],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a completion count." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum completion count." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum completion count." }
      ]
    },
    {
      id: "parallelism",
      label: "Parallelism",
      sectionId: "lifecycle",
      description: "Maximum number of pods run concurrently.",
      impact: "Caps concurrent execution for standard training.",
      yamlPath: "parallelism",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [standardTraining],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a parallelism value." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum parallelism." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum parallelism." }
      ]
    },
    {
      id: "cleanPodPolicy",
      label: "Clean Pod Policy",
      sectionId: "distributed",
      description: "Which pods are deleted when a distributed workload reaches terminal state.",
      impact: "Controls how much pod history is retained for post-run debugging.",
      yamlPath: "cleanPodPolicy",
      inputKind: "select",
      valueType: "string",
      options: ["Running", "All", "None"],
      supportedWorkloads: [distributedTraining],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a cleanup policy." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict cleanup options." }
      ]
    },
    {
      id: "distributedFramework",
      label: "Distributed Framework",
      sectionId: "distributed",
      description: "Framework used for distributed training.",
      impact: "Determines which distributed-only settings are relevant.",
      yamlPath: "distributedFramework",
      inputKind: "select",
      valueType: "string",
      options: ["MPI", "PyTorch", "TF", "XGBoost", "JAX"],
      supportedWorkloads: [distributedTraining],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a distributed framework." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict framework options." }
      ]
    },
    {
      id: "numWorkers",
      label: "Number Of Workers",
      sectionId: "distributed",
      description: "Number of worker nodes for distributed training.",
      impact: "Defines scale for distributed training worker replicas.",
      yamlPath: "numWorkers",
      inputKind: "number",
      valueType: "integer",
      defaultValue: 2,
      supportedWorkloads: [distributedTraining],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a worker count." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum worker count." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum worker count." }
      ]
    },
    {
      id: "mpiLauncherCreationPolicy",
      label: "MPI Launcher Creation Policy",
      sectionId: "distributed",
      description: "When the MPI launcher should be created.",
      impact: "Prevents launcher startup before workers are ready when necessary.",
      yamlPath: "mpiLauncherCreationPolicy",
      inputKind: "select",
      valueType: "string",
      options: ["AtStartup", "WaitForWorkersReady"],
      supportedWorkloads: [distributedTraining],
      dependsOn: [{ fieldId: "distributedFramework", values: ["MPI"] }],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a launcher creation policy." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict launcher behavior values." }
      ]
    },
    {
      id: "slotsPerWorker",
      label: "Slots Per Worker",
      sectionId: "distributed",
      description: "MPI slots per worker node.",
      impact: "Shapes how many processes MPI may schedule on each worker.",
      yamlPath: "slotsPerWorker",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [distributedTraining],
      dependsOn: [{ fieldId: "distributedFramework", values: ["MPI"] }],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require slots per worker." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum slots per worker." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum slots per worker." }
      ]
    },
    {
      id: "workers",
      label: "Workers",
      sectionId: "distributed",
      description: "Number of worker nodes for distributed inference.",
      impact: "Defines how many worker nodes run beside the leader.",
      yamlPath: "workers",
      inputKind: "number",
      valueType: "integer",
      defaultValue: 0,
      supportedWorkloads: [distributedInference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a worker count." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum worker count." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum worker count." }
      ]
    },
    {
      id: "replicas",
      label: "Replicas",
      sectionId: "distributed",
      description: "Replica count for the workload.",
      impact: "Controls horizontal scale for supported workload types.",
      yamlPath: "replicas",
      inputKind: "number",
      valueType: "integer",
      defaultValue: 1,
      supportedWorkloads: [distributedInference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a replica count." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum replicas." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum replicas." }
      ]
    },
    {
      id: "startupPolicy",
      label: "Startup Policy",
      sectionId: "distributed",
      description: "When distributed inference workers should start.",
      impact: "Controls whether workers wait for leader creation or readiness.",
      yamlPath: "startupPolicy",
      inputKind: "select",
      valueType: "string",
      options: ["LeaderCreated", "LeaderReady"],
      supportedWorkloads: [distributedInference],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a startup policy." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict startup policy values." }
      ]
    },
    {
      id: "PodAffinitySchedulingRule",
      label: "Pod Affinity Scheduling Rule",
      sectionId: "scheduling",
      description: "Whether pod affinity is enforced as hard or soft.",
      impact: "Changes how strictly the scheduler honors pod affinity constraints.",
      yamlPath: "PodAffinitySchedulingRule",
      inputKind: "select",
      valueType: "string",
      options: ["hard", "soft"],
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an affinity scheduling rule." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict affinity scheduling values." }
      ]
    },
    {
      id: "podAffinityTopology",
      label: "Pod Affinity Topology",
      sectionId: "scheduling",
      description: "Topology key used by pod affinity scheduling.",
      impact: "Changes which topology domain is used when evaluating pod affinity.",
      yamlPath: "podAffinityTopology",
      inputKind: "text",
      valueType: "string",
      placeholder: "kubernetes.io/hostname",
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a topology key." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the topology key." }
      ]
    },
    {
      id: "autoDeletionTimeAfterCompletionSeconds",
      label: "Auto Deletion After Completion",
      sectionId: "lifecycle",
      description: "Duration after which a finished workload is deleted automatically.",
      impact: "Controls how long completed workloads remain available for debugging.",
      yamlPath: "autoDeletionTimeAfterCompletionSeconds",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: interactiveAndTraining,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit deletion interval." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum retention interval." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum retention interval." }
      ]
    },
    {
      id: "terminationGracePeriodSeconds",
      label: "Termination Grace Period Seconds",
      sectionId: "lifecycle",
      description: "Grace period before a preempted workload is forcibly terminated.",
      impact: "Gives the workload time to checkpoint or exit cleanly before termination.",
      yamlPath: "terminationGracePeriodSeconds",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: interactiveAndTraining,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a grace period." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum grace period." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum grace period." }
      ]
    },
    {
      id: "capabilities",
      label: "Capabilities",
      sectionId: "security",
      description: "Linux capabilities granted to the workload container.",
      impact: "Expands the container privilege surface in a granular way.",
      yamlPath: "security.capabilities",
      inputKind: "list",
      valueType: "array",
      placeholder: "NET_ADMIN, SYS_PTRACE",
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require capabilities to be explicitly set." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the capabilities." }
      ]
    },
    {
      id: "seccompProfileType",
      label: "Seccomp Profile Type",
      sectionId: "security",
      description: "Seccomp profile type for the workload container.",
      impact: "Changes syscall filtering behavior and runtime hardening.",
      yamlPath: "security.seccompProfileType",
      inputKind: "select",
      valueType: "string",
      options: ["RuntimeDefault", "Unconfined"],
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a seccomp profile type." },
        { id: "options", label: "Allowed Values", inputKind: "text", description: "Restrict seccomp profile values." }
      ]
    },
    {
      id: "readOnlyRootFilesystem",
      label: "Read Only Root Filesystem",
      sectionId: "security",
      description: "Whether the container root filesystem is mounted read-only.",
      impact: "Strengthens container hardening but may break workloads that write to root paths.",
      yamlPath: "security.readOnlyRootFilesystem",
      inputKind: "boolean",
      valueType: "boolean",
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the root filesystem mode." }
      ]
    },
    {
      id: "supplementalGroups",
      label: "Supplemental Groups",
      sectionId: "security",
      description: "Supplemental group IDs applied to the workload container.",
      impact: "Expands filesystem and device group access for the container.",
      yamlPath: "security.supplementalGroups",
      inputKind: "list",
      valueType: "array",
      placeholder: "1000, 1001",
      supportedWorkloads: exceptNim,
      scopeByWorkload: {
        [distributedTraining]: "role",
        [distributedInference]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require supplemental groups." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the group list." }
      ]
    },
    {
      id: "hostIpc",
      label: "Host IPC",
      sectionId: "security",
      description: "Whether the workload shares the host IPC namespace.",
      impact: "Increases access to host-level inter-process communication resources.",
      yamlPath: "security.hostIpc",
      inputKind: "boolean",
      valueType: "boolean",
      supportedWorkloads: [workspace, standardTraining, distributedTraining],
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing host IPC mode." }
      ]
    },
    {
      id: "hostNetwork",
      label: "Host Network",
      sectionId: "security",
      description: "Whether the workload shares the host network namespace.",
      impact: "Bypasses pod networking isolation and exposes host network behavior.",
      yamlPath: "security.hostNetwork",
      inputKind: "boolean",
      valueType: "boolean",
      supportedWorkloads: [workspace, standardTraining, distributedTraining],
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit value." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing host networking mode." }
      ]
    },
    {
      id: "privileged",
      label: "Privileged",
      sectionId: "security",
      description: "Whether the container runs in privileged mode.",
      impact: "Greatly expands container access to host resources and should be tightly controlled.",
      yamlPath: "privileged",
      inputKind: "boolean",
      valueType: "boolean",
      supportedWorkloads: classicWorkloads,
      scopeByWorkload: {
        [distributedTraining]: "role"
      },
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an explicit privileged mode value." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing privileged mode." }
      ]
    },
    {
      id: "sshAuthMountPath",
      label: "SSH Auth Mount Path",
      sectionId: "distributed",
      description: "Directory where SSH auth material is mounted for MPI jobs.",
      impact: "Controls where worker SSH keys appear inside distributed MPI workloads.",
      yamlPath: "sshAuthMountPath",
      inputKind: "text",
      valueType: "string",
      placeholder: "/root/.ssh",
      supportedWorkloads: [distributedTraining],
      dependsOn: [{ fieldId: "distributedFramework", values: ["MPI"] }],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require an SSH auth mount path." },
        { id: "canEdit", label: "Can Edit", inputKind: "boolean", description: "Allow changing the mount path." }
      ]
    },
    {
      id: "minReplicas",
      label: "Min Replicas",
      sectionId: "distributed",
      description: "Lower autoscaling bound for distributed training workers.",
      impact: "Defines the minimum worker scale for distributed training autoscaling.",
      yamlPath: "minReplicas",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [distributedTraining],
      dependsOn: [{ fieldId: "distributedFramework", values: ["PyTorch"] }],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a minimum replica count." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum allowed value." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum allowed value." }
      ]
    },
    {
      id: "maxReplicas",
      label: "Max Replicas",
      sectionId: "distributed",
      description: "Upper autoscaling bound for distributed training workers.",
      impact: "Caps distributed training worker scale under autoscaling.",
      yamlPath: "maxReplicas",
      inputKind: "number",
      valueType: "integer",
      supportedWorkloads: [distributedTraining],
      dependsOn: [{ fieldId: "distributedFramework", values: ["PyTorch"] }],
      settingsSchema: [
        { id: "required", label: "Required", inputKind: "boolean", description: "Require a maximum replica count." },
        { id: "min", label: "Min", inputKind: "number", description: "Minimum allowed value." },
        { id: "max", label: "Max", inputKind: "number", description: "Maximum allowed value." }
      ]
    }
  ]
};

export const catalog: Catalog = {
  ...baseCatalog,
  fields: baseCatalog.fields.map((field) => ({
    ...field,
    settingsSchema: normalizeSettings(field)
  }))
};
