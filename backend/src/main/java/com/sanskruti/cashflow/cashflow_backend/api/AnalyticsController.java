package com.sanskruti.cashflow.cashflow_backend.api;

import com.sanskruti.cashflow.cashflow_backend.api.dto.SummaryResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.WeeklyPoint;
import com.sanskruti.cashflow.cashflow_backend.service.AnalyticsService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/datasets")
public class AnalyticsController {
    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/{id}/summary")
    public SummaryResponse summary(@PathVariable Long id) {
        return analyticsService.computeSummary(id);
    }

    @GetMapping("/{id}/weekly")
    public List<WeeklyPoint> weekly(@PathVariable Long id) {
        return analyticsService.computeWeeklySeries(id);
    }
    
}
