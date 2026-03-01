package com.sanskruti.cashflow.cashflow_backend.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanskruti.cashflow.cashflow_backend.api.dto.AiInsightsResponse;
import com.sanskruti.cashflow.cashflow_backend.service.AiInsightsService;
import com.sanskruti.cashflow.cashflow_backend.service.AnalyticsService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/datasets")
public class AiController {

    private final AnalyticsService analyticsService;
    private final AiInsightsService aiInsightsService;
    private final ObjectMapper objectMapper;

    public AiController(AnalyticsService analyticsService,
                        AiInsightsService aiInsightsService,
                        ObjectMapper objectMapper) {
        this.analyticsService = analyticsService;
        this.aiInsightsService = aiInsightsService;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/{id}/explain")
    public AiInsightsResponse explain(@PathVariable Long id,
                                      @RequestParam(defaultValue = "12") int horizon) throws Exception {

        var summary = analyticsService.computeSummary(id);
        var risk = analyticsService.risk(id);
        var drivers = analyticsService.topExpenseDrivers(id, 5);
        var forecast = analyticsService.forecastWeeklyNet(id, horizon);

        // Grounded payload: only facts
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("datasetId", id);
        payload.put("summary", summary);
        payload.put("risk", risk);
        payload.put("topExpenseDrivers", drivers);
        payload.put("forecastWeeklyNet", forecast);

        String groundedJson = objectMapper.writeValueAsString(payload);
        return aiInsightsService.generateInsights(groundedJson);
    }
}