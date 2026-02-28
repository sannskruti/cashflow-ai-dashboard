package com.sanskruti.cashflow.cashflow_backend.api.dto;

public record SummaryResponse ( Long datasetId,
    double totalIncome,
    double totalExpense,
    double netCashflow,
    double avgWeeklyNet,
    double avgWeeklyExpense)
    
{}
