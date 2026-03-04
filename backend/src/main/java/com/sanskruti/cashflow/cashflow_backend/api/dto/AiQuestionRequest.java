package com.sanskruti.cashflow.cashflow_backend.api.dto;

import jakarta.validation.constraints.NotBlank;

public record AiQuestionRequest(@NotBlank String question) {}
