package com.sanskruti.cashflow.cashflow_backend.api.dto;

import java.util.List;

public record AiAnswerResponse(
        String answer,
        List<String> supportingPoints,
        List<String> retrievedContext,
        String method
) {}
