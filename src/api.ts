import { catalog } from "./catalog";
import { generatePolicy as buildPolicy } from "./policy";
import type { Catalog, GenerateRequest, GenerateResponse } from "./types";

export async function fetchCatalog(): Promise<Catalog> {
  return catalog;
}

export async function generatePolicy(payload: GenerateRequest): Promise<GenerateResponse> {
  return buildPolicy(payload);
}
