import { AppDataSource } from "../data-source";
import { ProviderIntegrationSettings } from "../entities/ProviderIntegrationSettings";
import ProviderIntegrationSettingsRepo from "../repository/ProviderIntegrationSettingsRepo";

interface FetchTeamworkParams {
  companyId: string;
  provider: string;
  endpoint: string;
  queryparams?: string | string[];
}

interface UpdateProjectParams {
  companyId: string;
  provider: string;
  projectIds: string | string[];
  payload: Record<string, any>;
}


// Fetch provider credentials from database using repository
const providerIntegrationSettingsRepo = new ProviderIntegrationSettingsRepo(
  AppDataSource.getRepository(ProviderIntegrationSettings)
);
/**
 * Fetch data from Teamwork 3rd party API
 * Retrieves credentials from ProviderIntegrationSettings table based on companyId and provider
 */
export async function fetchTeamworkData(params: FetchTeamworkParams) {
  try {
    const { companyId, provider, endpoint, queryparams: queryParams } = params;

    const providerSettings = await providerIntegrationSettingsRepo.repository.findOne({
      where: {
        company: { id: companyId },
        provider,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!providerSettings) {
      throw new Error(
        `Provider settings not found for company ${companyId} and provider ${provider}`
      );
    }
    // return providerSettings;
    const credentials = providerSettings.credentials?.additionalProp1 as any;
    const baseUrl = credentials.baseUrl;
    const apiKey = credentials.apiKey;
    const apiPassword = credentials.password;

    if (!baseUrl || !apiKey || !apiPassword) {
      throw new Error("Base URL, API key, and password must be configured in provider settings");
    }

    let url = `${baseUrl}${endpoint}`;

    // Append query parameters if provided
    if (queryParams) {
      const params = Array.isArray(queryParams) ? queryParams : [queryParams];
      const queryString = params.join("&");
      // url = `${url}/projects/api/v3/?${queryString}`;
      url = `${url}/projects/api/v3/?includeCustomFields=true&${queryString}`;
    }

    const options: any = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    };
    const encoded = Buffer.from(`${apiKey}:${apiPassword}`).toString("base64");
    options.headers.Authorization = `Basic ${encoded}`;

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(
        `Teamwork API returned status ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();

    // Enrich projects with custom field values (clientId and companyId)
    if (data.projects && data.included?.customfields && data.included?.customfieldProjects) {
      const customfields = data.included.customfields;
      const customfieldProjects = data.included.customfieldProjects;

      // Find clientId and companyId custom field definitions
      const clientIdField = Object.values(customfields).find(
        (cf: any) => cf.name.toLowerCase() === "clientid" && cf.entity === "project"
      ) as any;
      const companyIdField = Object.values(customfields).find(
        (cf: any) => cf.name.toLowerCase() === "companyid" && cf.entity === "project"
      ) as any;

      // Map custom field values to each project
      data.projects = data.projects.map((project: any) => {
        const enrichedProject = { ...project };

        // Get custom field values for this project
        if (project.customfieldValues && Array.isArray(project.customfieldValues)) {
          project.customfieldValues.forEach((cfValue: any) => {
            const customfieldProject = customfieldProjects[cfValue.id];
            
            if (customfieldProject) {
              // Check if it's clientId field
              if (clientIdField && customfieldProject.customfieldId === clientIdField.id) {
                enrichedProject.clientId = customfieldProject.value;
              }
              // Check if it's companyId field
              if (companyIdField && customfieldProject.customfieldId === companyIdField.id) {
                enrichedProject.companyId = customfieldProject.value;
              }
            }
          });
        }

        return enrichedProject;
      });
    }

    return {
      message: "Data fetched successfully from Teamwork API",
      data,
    };
  } catch (error: any) {
    throw new Error(
      `Failed to fetch Teamwork data: ${error.message}`
    );
  }
}

/**
 * Update project(s) in Teamwork 3rd party API
 * Accepts any payload to update project properties (custom fields, status, logo, etc.)
 * Supports updating single or multiple projects with the same payload
 */
export async function updateProject(params: UpdateProjectParams) {
  try {
    const { companyId, provider, projectIds, payload } = params;

    const providerSettings = await providerIntegrationSettingsRepo.repository.findOne({
      where: {
        company: { id: companyId },
        provider,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!providerSettings) {
      throw new Error(
        `Provider settings not found for company ${companyId} and provider ${provider}`
      );
    }

    const credentials = providerSettings.credentials?.additionalProp1 as any;
    const baseUrl = credentials.baseUrl;
    const apiKey = credentials.apiKey;
    const apiPassword = credentials.password;

    if (!baseUrl || !apiKey || !apiPassword) {
      throw new Error("Base URL, API key, and password must be configured in provider settings");
    }

    const encoded = Buffer.from(`${apiKey}:${apiPassword}`).toString("base64");
    const projectIdArray = Array.isArray(projectIds) ? projectIds : [projectIds];

    // Prepare headers for custom field lookups
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Basic ${encoded}`,
    };

    // Get or create custom field IDs
    const clientIdFieldId = await getOrCreateClientIdField(companyId, provider, baseUrl, headers);
    const companyIdFieldId = await getOrCreateCompanyIdField(companyId, provider, baseUrl, headers);
    // Update payload with custom field IDs if not already present
    if (!payload.project) {
      payload.project = {};
    }
    if (!payload.project.customFields) {
      payload.project.customFields = [];
    }

    // Add clientId custom field if payload contains clientId
    if (payload.clientId !== undefined) {
      payload.project.customFields.push({
        customfieldId: clientIdFieldId,
        value: payload.clientId,
      });
      delete payload.clientId;
    }

    // Add companyId custom field if payload contains companyId
    if (payload.companyId !== undefined) {
      payload.project.customFields.push({
        customfieldId: companyIdFieldId,
        value: payload.companyId,
      });
      delete payload.companyId;
    }

    const results: string | any[] = [];
    const errors = [];

    for (const id of projectIdArray) {
      try {
        const url = `${baseUrl}/projects/${id}.json`;

        const options: any = {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${encoded}`,
          },
          body: JSON.stringify(payload),
        };
        console.dir(options, { depth: 40 });
        const response = await fetch(url, options);

        if (!response.ok) {
          const errorText = await response.text();
          errors.push({
            projectId: id,
            error: `Status ${response.status}: ${response.statusText}. ${errorText}`,
          });
          continue;
        }

        // Teamwork PUT requests often return 200 with no body or minimal response
        let data = {};
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        }

        results.push({
          projectId: id,
          success: true,
          data,
        });
      } catch (err: any) {
        errors.push({
          projectId: id,
          error: err.message,
        });
      }
    }

    const successCount = results.length;
    const totalCount = projectIdArray.length;

    return {
      message: `Updated ${successCount} of ${totalCount} project(s) successfully`,
      data: {
        success: results,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          total: totalCount,
          successful: successCount,
          failed: errors.length,
        },
      },
    };
  } catch (error: any) {
    console.dir(error, { depth: 40 });
    throw new Error(
      `Failed to update project(s): ${error.message}`
    );
  }
}

/**
 * Helper to find or create the 'Client ID' custom field
 * Checks database first, then Teamwork API, and stores result in database
 */
export async function getOrCreateClientIdField(
  companyId: string,
  provider: string,
  baseUrl: string,
  headers: any
): Promise<number> {
  try {
    // 1. Check if custom field ID exists in database
    const providerSettings = await providerIntegrationSettingsRepo.repository.findOne({
      where: {
        company: { id: companyId },
        provider,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!providerSettings) {
      throw new Error(`Provider settings not found for company ${companyId}`);
    }

    // Check if clientIdFieldId exists in customFields
    const customFields = providerSettings.customFields as any;
    if (customFields?.clientIdFieldId) {
      return customFields.clientIdFieldId;
    }

    // 2. Not in database, fetch from Teamwork API
    const listUrl = `${baseUrl}projects/api/v3/customfields.json`;
    const listResponse = await fetch(listUrl, { method: "GET", headers });
    
    let fieldId: number;
    
    if (listResponse.ok) {
      const data = await listResponse.json();
      console.log('Teamwork customFields response:', JSON.stringify(data, null, 2));
      
      const existing = data.customFields?.find((cf: any) =>
        cf.name.toLowerCase() === "clientid" && cf.entity === "project"
      );
      
      if (existing && existing.id) {
        fieldId = existing.id;
      } else {
        // 3. Create new custom field in Teamwork
        const createUrl = `${baseUrl}projects/api/v3/customfields.json`;
        const payload = {
          customField: {
            name: "clientId",
            type: "text-short",
            entity: "project",
            description: "Vertoz Client Identifier",
            showAtProjectAdd: true,
            isPrivate: false,
            required: false
          }
        };

        const createResponse = await fetch(createUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error('Teamwork create field error:', errorText);
          throw new Error(`Failed to create 'Client ID' custom field: ${errorText}`);
        }

        const createdData = await createResponse.json();
        console.log('Teamwork create field response:', JSON.stringify(createdData, null, 2));
        
        if (!createdData?.customfield?.id) {
          throw new Error(`Invalid response from Teamwork API: ${JSON.stringify(createdData)}`);
        }
        
        fieldId = createdData.customfield.id;
      }
    } else {
      const errorText = await listResponse.text();
      console.error('Teamwork list fields error:', errorText);
      throw new Error(`Failed to fetch custom fields from Teamwork API: ${errorText}`);
    }

    // 4. Store field ID in database
    const updatedCustomFields = {
      ...customFields,
      clientIdFieldId: fieldId,
    };

    console.dir(updatedCustomFields, { depth: 40 });

    await providerIntegrationSettingsRepo.repository.update(
      { id: providerSettings.id },
      { customFields: updatedCustomFields }
    );

    return fieldId;
  } catch (error: any) {
    throw new Error(`Custom field resolution failed: ${error.message}`);
  }
}

/**
 * Helper to find or create the 'Company ID' custom field
 * Checks database first, then Teamwork API, and stores result in database
 */
export async function getOrCreateCompanyIdField(
  companyId: string,
  provider: string,
  baseUrl: string,
  headers: any
): Promise<number> {
  try {
    // 1. Check if custom field ID exists in database
    const providerSettings = await providerIntegrationSettingsRepo.repository.findOne({
      where: {
        company: { id: companyId },
        provider,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!providerSettings) {
      throw new Error(`Provider settings not found for company ${companyId}`);
    }

    // Check if companyIdFieldId exists in customFields
    const customFields = providerSettings.customFields as any;
    if (customFields?.companyIdFieldId) {
      return customFields.companyIdFieldId;
    }

    // 2. Not in database, fetch from Teamwork API
    const listUrl = `${baseUrl}projects/api/v3/customfields.json`;
    const listResponse = await fetch(listUrl, { method: "GET", headers });
    
    let fieldId: number;
    
    if (listResponse.ok) {
      const data = await listResponse.json();
      console.log('Teamwork customFields response:', JSON.stringify(data, null, 2));
      
      const existing = data.customFields?.find((cf: any) =>
        cf.name.toLowerCase() === "companyid" && cf.entity === "project"
      );
      
      if (existing && existing.id) {
        fieldId = existing.id;
      } else {
        // 3. Create new custom field in Teamwork
        const createUrl = `${baseUrl}projects/api/v3/customfields.json`;
        const payload = {
          customField: {
            name: "companyId",
            type: "text-short",
            entity: "project",
            description: "Vertoz Company Identifier",
            showAtProjectAdd: true,
            isPrivate: false,
            required: false
          }
        };

        const createResponse = await fetch(createUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error('Teamwork create field error:', errorText);
          throw new Error(`Failed to create 'Company ID' custom field: ${errorText}`);
        }

        const createdData = await createResponse.json();
        console.log('Teamwork create field response:', JSON.stringify(createdData, null, 2));
        
        if (!createdData?.customfield?.id) {
          throw new Error(`Invalid response from Teamwork API: ${JSON.stringify(createdData)}`);
        }
        
        fieldId = createdData.customfield.id;
      }
    } else {
      const errorText = await listResponse.text();
      console.error('Teamwork list fields error:', errorText);
      throw new Error(`Failed to fetch custom fields from Teamwork API: ${errorText}`);
    }

    
    // 4. Store field ID in database
    const updatedCustomFields = {
      ...customFields,
      companyIdFieldId: fieldId,
    };
 console.dir(updatedCustomFields, { depth: 40 });
    await providerIntegrationSettingsRepo.repository.update(
      { id: providerSettings.id },
      { customFields: updatedCustomFields }
    );

    return fieldId;
  } catch (error: any) {
    throw new Error(`Custom field resolution failed: ${error.message}`);
  }
}

(module as any).exports = {
  fetchTeamworkData,
  updateProject,
  getOrCreateClientIdField,
  getOrCreateCompanyIdField,
};
