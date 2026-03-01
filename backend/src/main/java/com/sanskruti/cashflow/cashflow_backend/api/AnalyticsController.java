package com.sanskruti.cashflow.cashflow_backend.api;

import com.sanskruti.cashflow.cashflow_backend.api.dto.DriverPoint;
import com.sanskruti.cashflow.cashflow_backend.api.dto.RiskResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.SummaryResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.WeeklyPoint;
import com.sanskruti.cashflow.cashflow_backend.service.AnalyticsService;
import org.springframework.web.bind.annotation.*;

import com.sanskruti.cashflow.cashflow_backend.api.dto.DriverPoint;
import com.sanskruti.cashflow.cashflow_backend.api.dto.RiskResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.ForecastPoint;
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

    @GetMapping("/{id}/drivers")
    public List<DriverPoint> drivers(@PathVariable Long id, @RequestParam(defaultValue = "5") int limit) {
    return analyticsService.topExpenseDrivers(id, limit);
    }

    @GetMapping("/{id}/risk")
    public RiskResponse risk(@PathVariable Long id) {
    return analyticsService.risk(id);
    }
    @GetMapping("/{id}/forecast")
    public List<ForecastPoint> forecast(@PathVariable Long id, @RequestParam(defaultValue = "12") int horizon) {
    return analyticsService.forecastWeeklyNet(id, horizon);
    }
    
}
