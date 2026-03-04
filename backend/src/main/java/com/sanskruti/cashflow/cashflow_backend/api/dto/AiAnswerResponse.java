package com.sanskruti.cashflow.cashflow_backend.api.dto;

import java.util.List;

public record AiAnswerResponse(
        String answer,
        List<String> supportingPoints,
        List<RetrievedSource> retrievedContext,
        String method
) {
    public record RetrievedSource(
            Long id,
            String chunkType,
            String snippet,
            double similarity,
            String metadata
    ) {}
}
