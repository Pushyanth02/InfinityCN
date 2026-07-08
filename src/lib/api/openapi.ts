/**
 * Lemniscate — OpenAPI Specification
 * ----------------------------------------------------------------------------
 * Auto-generated OpenAPI 3.1 specification derived from the API validation
 * schemas and route definitions. Served at /api/v1/openapi.json.
 */

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Lemniscate API',
    description: 'Deterministic document-to-storytelling platform API',
    version: '1.0.0',
    contact: {
      name: 'Lemniscate',
      url: 'https://github.com/Pushyanth02/Lemniscate',
    },
  },
  servers: [
    { url: '/api/v1', description: 'Versioned API (v1)' },
  ],
  components: {
    securitySchemes: {
      apiKey: {
        type: 'http',
        scheme: 'bearer',
        description: 'Bearer token authentication using LEMNISCATE_API_KEY',
      },
      apiKeyHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'API key via x-api-key header',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'Machine-readable error code' },
              message: { type: 'string', description: 'Human-readable error message' },
              details: { type: 'object', description: 'Optional field-level validation details' },
            },
            required: ['code', 'message'],
          },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          limit: { type: 'integer' },
          offset: { type: 'integer' },
          total: { type: 'integer' },
          hasMore: { type: 'boolean' },
        },
      },
      Document: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          originalName: { type: 'string' },
          mimeType: { type: 'string' },
          sizeBytes: { type: 'integer' },
          status: { type: 'string', enum: ['UPLOADED', 'EXTRACTED', 'PROCESSED', 'FAILED'] },
          title: { type: 'string', nullable: true },
          author: { type: 'string', nullable: true },
          wordCount: { type: 'integer', nullable: true },
          chapterCount: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Narrative: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          documentId: { type: 'string' },
          mode: { type: 'string', enum: ['ORIGINAL', 'CINEMATIFIED'] },
          title: { type: 'string' },
          wordCount: { type: 'integer' },
          sceneCount: { type: 'integer' },
          paragraphCount: { type: 'integer' },
          readingTimeMin: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Scene: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          index: { type: 'integer' },
          title: { type: 'string' },
          summary: { type: 'string' },
          location: { type: 'string', nullable: true },
          mood: { type: 'string', nullable: true },
          tensionScore: { type: 'integer', minimum: 0, maximum: 100 },
          emotionScore: { type: 'integer', minimum: 0, maximum: 100 },
          momentumScore: { type: 'integer', minimum: 0, maximum: 100 },
          structurePhase: { type: 'string', nullable: true },
        },
      },
      Character: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          mentions: { type: 'integer' },
          role: { type: 'string', enum: ['PROTAGONIST', 'ANTAGONIST', 'SUPPORTING', 'MINOR'] },
          importanceScore: { type: 'integer', minimum: 0, maximum: 100 },
          confidenceScore: { type: 'integer', minimum: 0, maximum: 100 },
        },
      },
      RelationshipGraph: {
        type: 'object',
        properties: {
          edges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sourceCharacterId: { type: 'string' },
                sourceName: { type: 'string' },
                targetCharacterId: { type: 'string' },
                targetName: { type: 'string' },
                coOccurrences: { type: 'integer' },
                strength: { type: 'integer', minimum: 0, maximum: 100 },
                dialogueInteractions: { type: 'integer' },
              },
            },
          },
          centralities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                characterId: { type: 'string' },
                name: { type: 'string' },
                degree: { type: 'integer' },
                degreeCentrality: { type: 'number' },
                betweennessCentrality: { type: 'number' },
                closenessCentrality: { type: 'number' },
              },
            },
          },
          communities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                memberIds: { type: 'array', items: { type: 'string' } },
                memberNames: { type: 'array', items: { type: 'string' } },
                cohesion: { type: 'number' },
              },
            },
          },
          edgeCount: { type: 'integer' },
          maxStrength: { type: 'integer' },
        },
      },
      Job: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          documentId: { type: 'string' },
          mode: { type: 'string', enum: ['ORIGINAL', 'CINEMATIFIED', 'BOTH'] },
          status: { type: 'string', enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'DEAD_LETTER'] },
          progress: { type: 'integer', minimum: 0, maximum: 100 },
          stage: { type: 'string', nullable: true },
          error: { type: 'string', nullable: true },
        },
      },
      HealthStatus: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          status: { type: 'string', enum: ['healthy', 'degraded'] },
          database: { type: 'string', enum: ['connected', 'disconnected'] },
          latencyMs: { type: 'integer' },
          version: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        description: 'Liveness + database connectivity check',
        tags: ['System'],
        responses: {
          '200': { description: 'System healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthStatus' } } } },
          '503': { description: 'System degraded', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthStatus' } } } },
        },
      },
    },
    '/stats': {
      get: {
        summary: 'Dashboard statistics',
        description: 'Aggregate counts and recent job activity',
        tags: ['Analytics'],
        security: [{ apiKey: [] }, { apiKeyHeader: [] }],
        responses: {
          '200': { description: 'Dashboard stats' },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/documents': {
      get: {
        summary: 'List documents',
        tags: ['Documents'],
        security: [{ apiKey: [] }, { apiKeyHeader: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, minimum: 1, maximum: 200 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0, minimum: 0 } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'originalName', 'sizeBytes'] } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: {
          '200': { description: 'Paginated list of documents' },
        },
      },
    },
    '/documents/{id}': {
      get: {
        summary: 'Get document by ID',
        tags: ['Documents'],
        security: [{ apiKey: [] }, { apiKeyHeader: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Document detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/Document' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        summary: 'Delete document',
        tags: ['Documents'],
        security: [{ apiKey: [] }, { apiKeyHeader: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '204': { description: 'Deleted' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/narratives/{id}': {
      get: {
        summary: 'Get narrative with all artifacts',
        tags: ['Narratives'],
        security: [{ apiKey: [] }, { apiKeyHeader: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'view', in: 'query', schema: { type: 'string', enum: ['all', 'summary'] } },
          { name: 'paraLimit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'paraOffset', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'sceneLimit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'sceneOffset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': { description: 'Narrative with scenes, characters, locations, events, arcs, peaks' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/narratives/{id}/relationships': {
      get: {
        summary: 'Get relationship graph',
        description: 'Character relationship graph with edges, centralities, and communities',
        tags: ['Narratives', 'Relationships'],
        security: [{ apiKey: [] }, { apiKeyHeader: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Relationship graph', content: { 'application/json': { schema: { $ref: '#/components/schemas/RelationshipGraph' } } } },
          '404': { description: 'Narrative not found' },
        },
      },
    },
    '/narratives/{id}/export': {
      get: {
        summary: 'Export narrative',
        description: 'Export a narrative in markdown, HTML, EPUB, or JSON format',
        tags: ['Narratives', 'Export'],
        security: [{ apiKey: [] }, { apiKeyHeader: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['markdown', 'html', 'epub', 'json'], default: 'markdown' } },
        ],
        responses: {
          '200': { description: 'Exported file (content type varies by format)' },
          '404': { description: 'Narrative not found' },
        },
      },
    },
    '/jobs/{id}': {
      get: {
        summary: 'Get job status',
        tags: ['Jobs'],
        security: [{ apiKey: [] }, { apiKeyHeader: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Job status', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
          '404': { description: 'Not found' },
        },
      },
    },
  },
  tags: [
    { name: 'System', description: 'Health and system endpoints' },
    { name: 'Documents', description: 'Document upload and management' },
    { name: 'Narratives', description: 'Narrative viewing and analysis' },
    { name: 'Relationships', description: 'Character relationship graphs' },
    { name: 'Export', description: 'Narrative export endpoints' },
    { name: 'Jobs', description: 'Processing job management' },
    { name: 'Analytics', description: 'Dashboard and statistics' },
  ],
} as const
