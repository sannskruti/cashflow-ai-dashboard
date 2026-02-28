package com.sanskruti.cashflow.cashflow_backend.api.dto;

public record WeeklyPoint (
        String weekStart,   // ISO date string YYYY-MM-DD
        double income,
        double expense,
        double net
) {}
