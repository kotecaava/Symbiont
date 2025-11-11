export interface PdsaProduct {
  product: {
    id: string;
    name: string;
    design_system: {
      id: string;
      version?: string;
    };
    flows: PdsaFlowSummary[];
  };
}

export interface PdsaFlowSummary {
  id: string;
  file: string;
  label: string;
}

export interface PdsaFlowDefinition {
  id: string;
  label: string;
  type: string;
  actor?: string;
  breakpoints?: string[];
  screens: PdsaScreenDefinition[];
}

export interface PdsaScreenDefinition {
  id: string;
  name: string;
  breakpoint: string;
  components: PdsaComponentInstanceDefinition[];
  interactions?: PdsaInteractionDefinition[];
}

export interface PdsaComponentInstanceDefinition {
  id: string;
  label?: string;
}

export interface PdsaInteractionDefinition {
  from_component_id: string;
  action: 'navigate';
  to_screen_id: string;
}

export interface DesignSystemMapEntry {
  figma_ref: string;
  category: string;
}

export interface DesignSystemMap {
  design_system: string;
  components: Record<string, DesignSystemMapEntry>;
}

export interface GitHubRepositoryDetails {
  owner: string;
  repo: string;
  branch: string;
  basePath: string;
}

export interface GitHubSyncPayload {
  repo: GitHubRepositoryDetails;
  pds: PdsaProduct;
  flows: Record<string, PdsaFlowDefinition>;
  designSystem: DesignSystemMap;
}

export interface UiSyncRequest extends GitHubRepositoryDetails {}

export interface UiSyncResponse {
  ok: boolean;
  error?: string;
}
