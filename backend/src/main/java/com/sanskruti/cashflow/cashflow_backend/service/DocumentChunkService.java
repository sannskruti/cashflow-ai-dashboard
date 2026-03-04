package com.sanskruti.cashflow.cashflow_backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class DocumentChunkService {

    private static final Logger log = LoggerFactory.getLogger(DocumentChunkService.class);

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final AiInsightsService aiInsightsService;
    private volatile boolean schemaReady = false;
    private volatile boolean vectorEnabled = false;

    public DocumentChunkService(NamedParameterJdbcTemplate jdbcTemplate,
                                AiInsightsService aiInsightsService) {
        this.jdbcTemplate = jdbcTemplate;
        this.aiInsightsService = aiInsightsService;
    }

    public synchronized void ensureSchema() {
        if (schemaReady) return;
        try {
            try {
                jdbcTemplate.getJdbcTemplate().execute("CREATE EXTENSION IF NOT EXISTS vector");
                vectorEnabled = true;
            } catch (Exception e) {
                vectorEnabled = false;
                log.warn("pgvector extension unavailable (running lexical mode): {}", e.getMessage());
            }

            if (vectorEnabled) {
                jdbcTemplate.getJdbcTemplate().execute("""
                        CREATE TABLE IF NOT EXISTS document_chunks (
                          id BIGSERIAL PRIMARY KEY,
                          dataset_id BIGINT NOT NULL,
                          chunk_text TEXT NOT NULL,
                          chunk_type VARCHAR(32) NOT NULL,
                          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                          embedding VECTOR(1536) NOT NULL,
                          created_at TIMESTAMP NOT NULL DEFAULT NOW()
                        )
                        """);
                jdbcTemplate.getJdbcTemplate().execute("""
                        CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_ivfflat
                        ON document_chunks USING ivfflat (embedding vector_cosine_ops)
                        """);
            } else {
                jdbcTemplate.getJdbcTemplate().execute("""
                        CREATE TABLE IF NOT EXISTS document_chunks (
                          id BIGSERIAL PRIMARY KEY,
                          dataset_id BIGINT NOT NULL,
                          chunk_text TEXT NOT NULL,
                          chunk_type VARCHAR(32) NOT NULL,
                          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                          created_at TIMESTAMP NOT NULL DEFAULT NOW()
                        )
                        """);
            }

            jdbcTemplate.getJdbcTemplate().execute("""
                    CREATE INDEX IF NOT EXISTS idx_document_chunks_dataset
                    ON document_chunks (dataset_id)
                    """);
            jdbcTemplate.getJdbcTemplate().execute("""
                    CREATE INDEX IF NOT EXISTS idx_document_chunks_type
                    ON document_chunks (chunk_type)
                    """);
            schemaReady = true;
        } catch (Exception e) {
            log.warn("Could not initialize chunk schema: {}", e.getMessage());
            schemaReady = true;
        }
    }

    public void replaceDatasetChunks(Long datasetId, List<ChunkInput> chunks) {
        if (chunks.isEmpty()) {
            return;
        }
        ensureSchema();

        jdbcTemplate.update(
                "DELETE FROM document_chunks WHERE dataset_id = :datasetId",
                new MapSqlParameterSource("datasetId", datasetId)
        );

        if (vectorEnabled) {
            List<List<Double>> embeddings = aiInsightsService.embedTexts(
                    chunks.stream().map(ChunkInput::text).toList()
            );

            String insertSql = """
                    INSERT INTO document_chunks (dataset_id, chunk_text, chunk_type, metadata, embedding)
                    VALUES (:datasetId, :chunkText, :chunkType, CAST(:metadata AS jsonb), CAST(:embedding AS vector))
                    """;

            for (int i = 0; i < chunks.size(); i++) {
                ChunkInput c = chunks.get(i);
                MapSqlParameterSource params = new MapSqlParameterSource()
                        .addValue("datasetId", datasetId)
                        .addValue("chunkText", c.text())
                        .addValue("chunkType", c.type())
                        .addValue("metadata", c.metadataJson())
                        .addValue("embedding", toVectorLiteral(embeddings.get(i)));
                jdbcTemplate.update(insertSql, params);
            }
        } else {
            String insertSql = """
                    INSERT INTO document_chunks (dataset_id, chunk_text, chunk_type, metadata)
                    VALUES (:datasetId, :chunkText, :chunkType, CAST(:metadata AS jsonb))
                    """;
            for (ChunkInput c : chunks) {
                MapSqlParameterSource params = new MapSqlParameterSource()
                        .addValue("datasetId", datasetId)
                        .addValue("chunkText", c.text())
                        .addValue("chunkType", c.type())
                        .addValue("metadata", c.metadataJson());
                jdbcTemplate.update(insertSql, params);
            }
        }
    }

    public void appendDatasetChunks(Long datasetId, List<ChunkInput> chunks) {
        if (chunks.isEmpty()) {
            return;
        }
        ensureSchema();
        if (vectorEnabled) {
            List<List<Double>> embeddings = aiInsightsService.embedTexts(
                    chunks.stream().map(ChunkInput::text).toList()
            );

            String insertSql = """
                    INSERT INTO document_chunks (dataset_id, chunk_text, chunk_type, metadata, embedding)
                    VALUES (:datasetId, :chunkText, :chunkType, CAST(:metadata AS jsonb), CAST(:embedding AS vector))
                    """;

            for (int i = 0; i < chunks.size(); i++) {
                ChunkInput c = chunks.get(i);
                MapSqlParameterSource params = new MapSqlParameterSource()
                        .addValue("datasetId", datasetId)
                        .addValue("chunkText", c.text())
                        .addValue("chunkType", c.type())
                        .addValue("metadata", c.metadataJson())
                        .addValue("embedding", toVectorLiteral(embeddings.get(i)));
                jdbcTemplate.update(insertSql, params);
            }
        } else {
            String insertSql = """
                    INSERT INTO document_chunks (dataset_id, chunk_text, chunk_type, metadata)
                    VALUES (:datasetId, :chunkText, :chunkType, CAST(:metadata AS jsonb))
                    """;
            for (ChunkInput c : chunks) {
                MapSqlParameterSource params = new MapSqlParameterSource()
                        .addValue("datasetId", datasetId)
                        .addValue("chunkText", c.text())
                        .addValue("chunkType", c.type())
                        .addValue("metadata", c.metadataJson());
                jdbcTemplate.update(insertSql, params);
            }
        }
    }

    public List<ChunkInput> getDatasetChunks(Long datasetId) {
        ensureSchema();
        String sql = """
                SELECT chunk_type, chunk_text, metadata::text AS metadata_text
                FROM document_chunks
                WHERE dataset_id = :datasetId
                ORDER BY id
                """;
        return jdbcTemplate.query(sql, new MapSqlParameterSource("datasetId", datasetId), (rs, rowNum) ->
                new ChunkInput(
                        rs.getString("chunk_type"),
                        rs.getString("chunk_text"),
                        rs.getString("metadata_text")
                )
        );
    }

    public List<RetrievedSource> retrieve(Long datasetId, String question, int topK) {
        ensureSchema();
        if (!vectorEnabled) {
            String keyword = extractKeywordPattern(question);
            return lexicalFallback(datasetId, keyword, topK);
        }
        List<Double> queryEmbedding = aiInsightsService.embedTexts(List.of(question)).get(0);
        String keyword = extractKeywordPattern(question);

        String sqlBase = """
                SELECT
                  id,
                  dataset_id,
                  chunk_text,
                  chunk_type,
                  CAST(metadata AS TEXT) AS metadata_text,
                  (1.0 / (1.0 + (embedding <-> CAST(:queryEmbedding AS vector)))) AS similarity
                FROM document_chunks
                WHERE dataset_id = :datasetId
                """;
        String sql = (keyword == null || keyword.isBlank())
                ? sqlBase + " ORDER BY embedding <-> CAST(:queryEmbedding AS vector) LIMIT :topK"
                : sqlBase + " AND chunk_text ILIKE :keyword ORDER BY embedding <-> CAST(:queryEmbedding AS vector) LIMIT :topK";

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("datasetId", datasetId)
                .addValue("queryEmbedding", toVectorLiteral(queryEmbedding))
                .addValue("topK", topK);
        if (keyword != null && !keyword.isBlank()) {
            params.addValue("keyword", keyword);
        }

        List<RetrievedSource> rows;
        try {
            rows = jdbcTemplate.query(sql, params, (rs, rowNum) ->
                    new RetrievedSource(
                            rs.getLong("id"),
                            rs.getString("chunk_type"),
                            rs.getString("chunk_text"),
                            rs.getString("metadata_text"),
                            rs.getDouble("similarity")
                    )
            );
        } catch (Exception e) {
            log.warn("Vector retrieval failed, falling back to lexical retrieval: {}", e.getMessage());
            rows = lexicalFallback(datasetId, keyword, topK);
        }

        if (rows.isEmpty() && keyword != null) {
            rows = lexicalFallback(datasetId, null, topK);
        }

        return rows.stream()
                .sorted(Comparator.comparingDouble(RetrievedSource::similarity).reversed())
                .toList();
    }

    private String toVectorLiteral(List<Double> vector) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < vector.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(vector.get(i));
        }
        sb.append(']');
        return sb.toString();
    }

    private String extractKeywordPattern(String question) {
        String[] tokens = question.toLowerCase(Locale.ROOT).split("[^a-z0-9]+");
        String best = null;
        for (String token : tokens) {
            if (token.length() < 5) continue;
            if (best == null || token.length() > best.length()) {
                best = token;
            }
        }
        return best == null ? null : "%" + best + "%";
    }

    public record ChunkInput(String type, String text, String metadataJson) {}

    public record RetrievedSource(Long id, String chunkType, String chunkText, String metadata, double similarity) {}

    private List<RetrievedSource> lexicalFallback(Long datasetId, String keyword, int topK) {
        String sqlBase = """
                SELECT id, chunk_type, chunk_text, CAST(metadata AS TEXT) AS metadata_text
                FROM document_chunks
                WHERE dataset_id = :datasetId
                """;
        String sql = (keyword == null || keyword.isBlank())
                ? sqlBase + " ORDER BY id DESC LIMIT :topK"
                : sqlBase + " AND chunk_text ILIKE :keyword ORDER BY id DESC LIMIT :topK";
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("datasetId", datasetId)
                .addValue("topK", topK);
        if (keyword != null && !keyword.isBlank()) {
            params.addValue("keyword", keyword);
        }
        return jdbcTemplate.query(sql, params, (rs, rowNum) ->
                new RetrievedSource(
                        rs.getLong("id"),
                        rs.getString("chunk_type"),
                        rs.getString("chunk_text"),
                        rs.getString("metadata_text"),
                        0.0
                )
        );
    }
}
