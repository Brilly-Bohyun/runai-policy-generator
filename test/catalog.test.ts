import { describe, expect, it } from "vitest";
import { catalog } from "../src/catalog";
import type { Field } from "../src/types";

const fieldsById = new Map<string, Field>(catalog.fields.map((field) => [field.id, field]));

function field(id: string) {
  const match = fieldsById.get(id);
  if (!match) {
    throw new Error(`Missing catalog field: ${id}`);
  }

  return match;
}

describe("catalog policy metadata", () => {
  it("exposes the document-backed NVIDIA NIM workload type", () => {
    expect(catalog.workloadTypes.map((workload) => workload.id)).toContain("nim");
  });

  it("keeps document-backed scalar/list/object field types aligned", () => {
    expect(field("args").valueType).toBe("string");
    expect(field("imagePullSecrets").valueType).toBe("objectArray");
    expect(field("nodePools").valueType).toBe("array");
    expect(field("nodeAffinityRequired").valueType).toBe("object");
    expect(field("supplementalGroups").valueType).toBe("string");
    expect(field("capabilities").valueType).toBe("array");
    expect(field("probes").valueType).toBe("object");
    expect(field("servingPort").valueType).toBe("object");
    expect(field("autoscaling").valueType).toBe("object");
    expect(field("servingConfiguration").valueType).toBe("object");
    expect(field("ngcAuthSecret").valueType).toBe("string");
    expect(field("migProfile").valueType).toBe("string");
    expect(field("autoscalingMetricThreshold").valueType).toBe("integer");
    expect(field("completions").valueType).toBe("integer");
    expect(field("parallelism").valueType).toBe("integer");
  });

  it("keeps itemized fields itemized so defaults and rules use instances/attributes", () => {
    [
      "environmentVariables",
      "annotations",
      "labels",
      "tolerations",
      "extendedResources",
      "storageHostPath",
      "storagePvc",
      "storageGit",
      "storageS3",
      "storageNfs",
      "ports",
      "exposedUrls",
      "relatedUrls"
    ].forEach((fieldId) => {
      expect(field(fieldId).valueType).toBe("itemized");
    });
  });

  it("keeps aggregate fields on their documented YAML roots", () => {
    expect(field("servingPort").yamlPath).toBe("servingPort");
    expect(field("autoscaling").yamlPath).toBe("autoscaling");
    expect(field("servingConfiguration").yamlPath).toBe("servingConfiguration");
    expect(field("probes").yamlPath).toBe("probes");
  });

  it("keeps general network and serving fields in separate UI sections", () => {
    expect(catalog.sections.find((section) => section.id === "network")?.label).toBe("Network");
    expect(catalog.sections.find((section) => section.id === "serving")?.label).toBe("Serving");
    expect(field("ports").sectionId).toBe("network");
    expect(field("exposedUrls").sectionId).toBe("network");
    expect(field("relatedUrls").sectionId).toBe("network");
    expect(field("probes").sectionId).toBe("network");
    expect(field("servingPort").sectionId).toBe("serving");
    expect(field("autoscaling").sectionId).toBe("serving");
    expect(field("servingConfiguration").sectionId).toBe("serving");
  });

  it("does not expose the serving section for non-serving workload types", () => {
    const sectionIdsFor = (workloadId: string) =>
      new Set(
        catalog.fields
          .filter((item) => item.supportedWorkloads.includes(workloadId))
          .map((item) => item.sectionId)
      );

    expect(sectionIdsFor("workspace").has("network")).toBe(true);
    expect(sectionIdsFor("workspace").has("serving")).toBe(false);
    expect(sectionIdsFor("standardTraining").has("network")).toBe(true);
    expect(sectionIdsFor("standardTraining").has("serving")).toBe(false);
    expect(sectionIdsFor("distributedTraining").has("network")).toBe(true);
    expect(sectionIdsFor("distributedTraining").has("serving")).toBe(false);
    expect(sectionIdsFor("inference").has("serving")).toBe(true);
  });

  it("uses NIM-specific object placeholders where the YAML shape differs", () => {
    expect(field("servingPort").placeholderByWorkload?.nim).toContain("port=8000");
    expect(field("servingPort").placeholderByWorkload?.nim).not.toContain("container.port");
  });

  it("keeps regular ports placeholders on the documented item fields", () => {
    expect(field("ports").placeholder).toContain("container=8888");
    expect(field("ports").placeholder).not.toContain("container.port");
  });

  it("uses explicit toleration item fields in the placeholder", () => {
    expect(field("tolerations").placeholder).toContain("key=gpu");
    expect(field("tolerations").placeholder).toContain("operator=Equal");
    expect(field("tolerations").placeholder).toContain("effect=NoSchedule");
    expect(field("tolerations").placeholder).not.toContain("gpu=true:NoSchedule");
  });

  it("uses the workload API object shape for node affinity placeholders", () => {
    expect(field("nodeAffinityRequired").placeholder).toContain("key=run.ai/type");
    expect(field("nodeAffinityRequired").placeholder).toContain("operator=In");
    expect(field("nodeAffinityRequired").placeholder).toContain("values=training|inference");
  });

  it("uses workload API object fields for image pull secret placeholders", () => {
    expect(field("imagePullSecrets").placeholder).toContain("name=nvcr-pull-secret");
    expect(field("imagePullSecrets").placeholder).toContain("userCredential=false");
    expect(field("imagePullSecrets").placeholder).toContain("exclude=false");
  });

  it("uses documented storage item field names in placeholders", () => {
    expect(field("storagePvc").placeholder).toContain("path=");
    expect(field("storagePvc").placeholder).toContain("claimInfo.storageClass=");
    expect(field("storagePvc").placeholder).not.toContain("mountPath=");
    expect(field("storageGit").placeholder).toContain("path=");
    expect(field("storageGit").placeholder).toContain("branch=");
    expect(field("storageGit").placeholder).not.toContain("mountPath=");
    expect(field("storageNfs").placeholder).toContain("server=");
    expect(field("storageNfs").placeholder).not.toContain("nfsServer=");
    expect(field("storageS3").placeholder).toContain("path=");
    expect(field("storageS3").placeholder).toContain("url=");
    expect(field("storageS3").placeholder).not.toContain("mountPath=");
    expect(field("storageEmptyDir").placeholder).toContain("sizeLimit=");
    expect(field("storageConfigMapVolumes").placeholder).toContain("configMap=");
    expect(field("storageConfigMapVolumes").placeholder).toContain("defaultMode=0644");
    expect(field("storageSecretVolume").placeholder).toContain("secret=");
    expect(field("storageSecretVolume").placeholder).not.toContain("secretName=");
    expect(field("storageEmptyDir").yamlPath).toBe("storage.emptyDirVolume");
    expect(field("storageEmptyDir").placeholder).toContain("path=");
    expect(field("storageEmptyDir").placeholder).not.toContain("mountPath=");
  });

  it("scopes storage subtypes to the documented workload types", () => {
    [
      "storagePvc",
      "storageConfigMapVolumes",
      "storageSecretVolume",
      "storageEmptyDir"
    ].forEach((fieldId) => {
      expect(field(fieldId).supportedWorkloads).toContain("distributedInference");
      expect(field(fieldId).scopeByWorkload?.distributedInference).toBe("role");
    });

    [
      "storageHostPath",
      "storageDataVolume",
      "storageGit",
      "storageNfs"
    ].forEach((fieldId) => {
      expect(field(fieldId).supportedWorkloads).toEqual([
        "workspace",
        "standardTraining",
        "distributedTraining",
        "inference"
      ]);
      expect(field(fieldId).scopeByWorkload?.distributedInference).toBeUndefined();
    });

    expect(field("storageS3").supportedWorkloads).toEqual([
      "workspace",
      "standardTraining",
      "distributedTraining"
    ]);
  });

  it("uses the workload API casing for security runAsGid", () => {
    expect(field("runAsGid").yamlPath).toBe("security.runAsGid");
    expect(catalog.fields.some((item) => item.id === "runasGid")).toBe(false);
    expect(catalog.fields.some((item) => item.yamlPath === "security.runasGid")).toBe(false);
  });

  it("keeps GPU request type and MIG profile fields aligned with policy examples", () => {
    expect(field("gpuDeviceRequest").yamlPath).toBe("compute.gpuDevicesRequest");
    expect(field("gpuRequestType").options).toEqual(["portion", "memory"]);
    expect(field("gpuRequestType").options).not.toContain("device");
    expect(field("gpuRequestType").options).not.toContain("migProfile");
    expect(field("migProfile").yamlPath).toBe("compute.migProfile");
  });

  it("keeps documented spelling for preemption termination key", () => {
    expect(field("terminateAfterPreemtpion").yamlPath).toBe("terminateAfterPreemtpion");
    expect(catalog.fields.some((item) => item.id === "terminateAfterPreemption")).toBe(false);
  });

  it("provides simple item key fallbacks for URL itemized fields", () => {
    expect(field("exposedUrls").itemKey).toBe("url");
    expect(field("relatedUrls").itemKey).toBe("url");
  });

  it("requires name and value for name-value itemized fields", () => {
    expect(field("environmentVariables").itemRequiredKeys).toEqual(["name"]);
    expect(field("environmentVariables").itemRequiredAnyKeys).toEqual([
      "value",
      "secret",
      "configMap",
      "podFieldRef",
      "userCredential"
    ]);
    expect(field("annotations").itemRequiredKeys).toEqual(["name", "value"]);
    expect(field("labels").itemRequiredKeys).toEqual(["name", "value"]);
  });

  it("exposes locked itemized rules as key lists rather than booleans", () => {
    [
      "environmentVariables",
      "annotations",
      "labels",
      "storageHostPath",
      "ports",
      "exposedUrls"
    ].forEach((fieldId) => {
      const locked = field(fieldId).settingsSchema?.find((setting) => setting.id === "locked");

      expect(locked?.inputKind).toBe("text");
      expect(locked?.label).toBe("Locked Keys");
    });
  });

  it("does not expose locked toleration rules because Run:ai cannot match them to defaults", () => {
    const locked = field("tolerations").settingsSchema?.find((setting) => setting.id === "locked");

    expect(locked).toBeUndefined();
  });

  it("marks NIM-supported fields as available for NIM policies", () => {
    [
      "image",
      "imagePullPolicy",
      "imagePullSecrets",
      "environmentVariables",
      "nodePools",
      "annotations",
      "labels",
      "category",
      "priorityClass",
      "preemptibility",
      "tolerations",
      "probes",
      "servingPort",
      "servingPortPort",
      "servingPortExposeExternally",
      "servingPortExposedUrl",
      "servingPortServiceType",
      "servingPortGrpcPort",
      "servingPortMetricsPort",
      "servingPortExposedProtocol",
      "autoscaling",
      "autoscalingMinReplicas",
      "autoscalingMaxReplicas",
      "autoscalingMetricThreshold",
      "autoscalingScaleWindowSeconds",
      "replicas",
      "multiNode",
      "multiNodeWorkers",
      "ngcAuthSecret"
    ].forEach((fieldId) => {
      expect(field(fieldId).supportedWorkloads).toContain("nim");
    });
  });

  it("keeps non-NIM serving authorization fields out of NIM policies", () => {
    [
      "servingPortProtocol",
      "servingPortContainerPort",
      "servingPortAuthorizationType",
      "servingPortAuthorizedUsers",
      "servingPortAuthorizedGroups",
      "servingPortClusterLocalAccessOnly"
    ].forEach((fieldId) => {
      expect(field(fieldId).supportedWorkloads).not.toContain("nim");
    });
  });

  it("scopes serving fields to the workloads documented for each serving subsection", () => {
    expect(field("servingPort").supportedWorkloads).toEqual([
      "inference",
      "distributedInference",
      "nim"
    ]);
    expect(field("servingPortProtocol").supportedWorkloads).toEqual([
      "inference",
      "distributedInference"
    ]);
    expect(field("servingPortExposeExternally").supportedWorkloads).toEqual([
      "distributedInference",
      "nim"
    ]);
    expect(field("servingPortServiceType").supportedWorkloads).toEqual(["nim"]);
    expect(field("servingPortClusterLocalAccessOnly").supportedWorkloads).toEqual(["inference"]);
    expect(field("servingConfiguration").supportedWorkloads).toEqual(["inference"]);
  });

  it("scopes autoscaling fields to inference and NIM according to the reference", () => {
    expect(field("autoscaling").supportedWorkloads).toEqual(["inference", "nim"]);
    expect(field("autoscalingMetric").supportedWorkloads).toEqual(["inference"]);
    expect(field("autoscalingMetricThreshold").supportedWorkloads).toEqual([
      "inference",
      "nim"
    ]);
    expect(field("autoscalingScaleWindowSeconds").supportedWorkloads).toEqual(["nim"]);
  });

  it("keeps v2.24 top-level duplicate and lifecycle support ranges aligned", () => {
    expect(field("restartPolicy").supportedWorkloads).toEqual([
      "workspace",
      "standardTraining",
      "distributedTraining",
      "distributedInference"
    ]);
    expect(field("replicas").supportedWorkloads).toEqual(["distributedInference", "nim"]);
  });

  it("keeps v2.24+ API-only workload fields available", () => {
    expect(catalog.workloadTypes.find((workload) => workload.id === "distributedInference")?.highlights)
      .toContain("API-only fields");
    expect(catalog.workloadTypes.find((workload) => workload.id === "nim")?.highlights)
      .toContain("API-only");

    [
      "image",
      "command",
      "args",
      "createHomeDir",
      "workingDir",
      "nodeType",
      "extendedResources",
      "largeShmRequest",
      "capabilities",
      "seccompProfileType",
      "readOnlyRootFilesystem"
    ].forEach((fieldId) => {
      expect(field(fieldId).supportedWorkloads).toContain("distributedInference");
    });

    [
      "image",
      "imagePullPolicy",
      "imagePullSecrets",
      "nodePools",
      "priorityClass",
      "preemptibility",
      "probes",
      "replicas",
      "multiNode",
      "ngcAuthSecret"
    ].forEach((fieldId) => {
      expect(field(fieldId).supportedWorkloads).toContain("nim");
    });
  });
});
