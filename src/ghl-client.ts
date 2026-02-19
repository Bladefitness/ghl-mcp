/**
 * GoHighLevel API Client
 * Handles all HTTP communication with the GHL API
 * Base URL: https://services.leadconnectorhq.com
 */

export interface GHLClientConfig {
  apiKey: string;
  locationId: string;
}

export class GHLClient {
  private baseUrl = "https://services.leadconnectorhq.com";
  private apiKey: string;
  private locationId: string;

  constructor(config: GHLClientConfig) {
    this.apiKey = config.apiKey;
    this.locationId = config.locationId;
  }

  private headers(version?: string): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (version) {
      h["Version"] = version;
    }
    return h;
  }

  async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string>;
      version?: string;
    }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options?.query) {
      Object.entries(options.query).forEach(([k, v]) =>
        url.searchParams.set(k, v)
      );
    }

    const resp = await fetch(url.toString(), {
      method,
      headers: this.headers(options?.version),
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(
        `GHL API Error ${resp.status}: ${resp.statusText} - ${errorText}`
      );
    }

    return resp.json() as Promise<T>;
  }

  get defaultLocationId() {
    return this.locationId;
  }

  // ============================================================
  // CUSTOM FIELDS V2 (Custom Objects + Company)
  // Version: 2021-07-28
  // ============================================================

  /** Get all custom fields by object key */
  async getCustomFieldsByObjectKey(objectKey: string, locationId?: string) {
    return this.request<{
      fields: any[];
      folders: any[];
    }>("GET", `/custom-fields/object-key/${objectKey}`, {
      query: { locationId: locationId || this.locationId },
      version: "2021-07-28",
    });
  }

  /** Get a single custom field or folder by ID */
  async getCustomFieldById(id: string) {
    return this.request<{ field: any }>("GET", `/custom-fields/${id}`, {
      version: "2021-07-28",
    });
  }

  /** Create a custom field */
  async createCustomField(data: {
    locationId?: string;
    name?: string;
    description?: string;
    placeholder?: string;
    showInForms: boolean;
    dataType: string;
    fieldKey: string;
    objectKey: string;
    parentId: string;
    options?: { key: string; label: string; url?: string }[];
    acceptedFormats?: string;
    maxFileLimit?: number;
    allowCustomOption?: boolean;
  }) {
    return this.request<{ field: any }>("POST", `/custom-fields/`, {
      body: {
        ...data,
        locationId: data.locationId || this.locationId,
      },
      version: "2021-07-28",
    });
  }

  /** Update a custom field by ID */
  async updateCustomField(
    id: string,
    data: {
      locationId?: string;
      name?: string;
      description?: string;
      placeholder?: string;
      showInForms: boolean;
      options?: { key: string; label: string; url?: string }[];
      acceptedFormats?: string;
      maxFileLimit?: number;
    }
  ) {
    return this.request<{ field: any }>("PUT", `/custom-fields/${id}`, {
      body: {
        ...data,
        locationId: data.locationId || this.locationId,
      },
      version: "2021-07-28",
    });
  }

  /** Delete a custom field by ID */
  async deleteCustomField(id: string) {
    return this.request<{ succeded: boolean; id: string; key: string }>(
      "DELETE",
      `/custom-fields/${id}`,
      { version: "2021-07-28" }
    );
  }

  /** Create a custom field folder */
  async createCustomFieldFolder(data: {
    objectKey: string;
    name: string;
    locationId?: string;
  }) {
    return this.request<any>("POST", `/custom-fields/folder`, {
      body: {
        ...data,
        locationId: data.locationId || this.locationId,
      },
      version: "2021-07-28",
    });
  }

  /** Update a custom field folder name */
  async updateCustomFieldFolder(
    id: string,
    data: { name: string; locationId?: string }
  ) {
    return this.request<any>("PUT", `/custom-fields/folder/${id}`, {
      body: {
        ...data,
        locationId: data.locationId || this.locationId,
      },
      version: "2021-07-28",
    });
  }

  /** Delete a custom field folder */
  async deleteCustomFieldFolder(id: string, locationId?: string) {
    return this.request<{ succeded: boolean; id: string; key: string }>(
      "DELETE",
      `/custom-fields/folder/${id}`,
      {
        query: { locationId: locationId || this.locationId },
        version: "2021-07-28",
      }
    );
  }

  // ============================================================
  // LOCATION-LEVEL CUSTOM FIELDS (Contacts, standard objects)
  // Version: 2021-07-28
  // ============================================================

  /** Get all custom fields for a location (contact-level) */
  async getLocationCustomFields(locationId?: string) {
    const locId = locationId || this.locationId;
    return this.request<{ customFields: any[] }>(
      "GET",
      `/locations/${locId}/customFields`,
      { version: "2021-07-28" }
    );
  }

  /** Get a single location custom field */
  async getLocationCustomField(fieldId: string, locationId?: string) {
    const locId = locationId || this.locationId;
    return this.request<{ customField: any }>(
      "GET",
      `/locations/${locId}/customFields/${fieldId}`,
      { version: "2021-07-28" }
    );
  }

  /** Create a location-level custom field */
  async createLocationCustomField(
    data: {
      name: string;
      dataType: string;
      placeholder?: string;
      position?: number;
      options?: string[];
      acceptedFormat?: string[];
      isMultipleFile?: boolean;
      maxNumberOfFiles?: number;
      isAllowedCustomOption?: boolean;
      isRequired?: boolean;
      model?: string;
    },
    locationId?: string
  ) {
    const locId = locationId || this.locationId;
    return this.request<{ customField: any }>(
      "POST",
      `/locations/${locId}/customFields`,
      { body: data, version: "2021-07-28" }
    );
  }

  /** Update a location-level custom field */
  async updateLocationCustomField(
    fieldId: string,
    data: {
      name?: string;
      placeholder?: string;
      position?: number;
      options?: string[];
      acceptedFormat?: string[];
      isMultipleFile?: boolean;
      maxNumberOfFiles?: number;
      isAllowedCustomOption?: boolean;
      isRequired?: boolean;
    },
    locationId?: string
  ) {
    const locId = locationId || this.locationId;
    return this.request<{ customField: any }>(
      "PUT",
      `/locations/${locId}/customFields/${fieldId}`,
      { body: data, version: "2021-07-28" }
    );
  }

  /** Delete a location-level custom field */
  async deleteLocationCustomField(fieldId: string, locationId?: string) {
    const locId = locationId || this.locationId;
    return this.request<any>(
      "DELETE",
      `/locations/${locId}/customFields/${fieldId}`,
      { version: "2021-07-28" }
    );
  }

  // ============================================================
  // CUSTOM VALUES (Location-level reusable values)
  // ============================================================

  /** Get all custom values for a location */
  async getCustomValues(locationId?: string) {
    const locId = locationId || this.locationId;
    return this.request<{ customValues: any[] }>(
      "GET",
      `/locations/${locId}/customValues`,
      { version: "2021-07-28" }
    );
  }

  /** Get a single custom value */
  async getCustomValue(valueId: string, locationId?: string) {
    const locId = locationId || this.locationId;
    return this.request<{ customValue: any }>(
      "GET",
      `/locations/${locId}/customValues/${valueId}`,
      { version: "2021-07-28" }
    );
  }

  /** Create a custom value */
  async createCustomValue(
    data: { name: string; value: string },
    locationId?: string
  ) {
    const locId = locationId || this.locationId;
    return this.request<{ customValue: any }>(
      "POST",
      `/locations/${locId}/customValues`,
      { body: data, version: "2021-07-28" }
    );
  }

  /** Update a custom value */
  async updateCustomValue(
    valueId: string,
    data: { name?: string; value?: string },
    locationId?: string
  ) {
    const locId = locationId || this.locationId;
    return this.request<{ customValue: any }>(
      "PUT",
      `/locations/${locId}/customValues/${valueId}`,
      { body: data, version: "2021-07-28" }
    );
  }

  /** Delete a custom value */
  async deleteCustomValue(valueId: string, locationId?: string) {
    const locId = locationId || this.locationId;
    return this.request<any>(
      "DELETE",
      `/locations/${locId}/customValues/${valueId}`,
      { version: "2021-07-28" }
    );
  }
}
