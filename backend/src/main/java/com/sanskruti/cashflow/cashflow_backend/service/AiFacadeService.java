package com.sanskruti.cashflow.cashflow_backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanskruti.cashflow.cashflow_backend.api.dto.AiAnswerResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.AiInsightsResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AiFacadeService {

    private static final Logger log = LoggerFactory.getLogger(AiFacadeService.class);

    private final AnalyticsService analyticsService;
    private final AiInsightsService aiInsightsService;
    private final AiRagService aiRagService;
    private final ObjectMapper objectMapper;

    public AiFacadeService(AnalyticsService analyticsService,
                           AiInsightsService aiInsightsService,
                           AiRagService aiRagService,
                           ObjectMapper objectMapper) {
        this.analyticsService = analyticsService;
        this.aiInsightsService = aiInsightsService;
        this.aiRagService = aiRagService;
        this.objectMapper = objectMapper;
    }

    @Cacheable(cacheNames = "aiInsights", key = "#datasetId + ':' + #horizon")
    public AiInsightsResponse explainCached(Long datasetId, int horizon) throws Exception {

        var summary = analyticsService.computeSummary(datasetId);
        var risk = analyticsService.risk(datasetId);
        var drivers = analyticsService.topExpenseDrivers(datasetId, 5);
        var forecast = analyticsService.forecastWeeklyNet(datasetId, horizon);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("datasetId", datasetId);
        payload.put("summary", summary);
        payload.put("risk", risk);
        payload.put("topExpenseDrivers", drivers);
        payload.put("forecastWeeklyNet", forecast);

        String groundedJson = objectMapper.writeValueAsString(payload);
        AiInsightsResponse insights = aiInsightsService.generateInsights(groundedJson);
        try {
            aiRagService.appendInsights(datasetId, insights);
        } catch (Exception e) {
            log.warn("Failed to append insight chunks for dataset {}: {}", datasetId, e.getMessage());
        }
        return insights;
    }

    public AiAnswerResponse askFromInsights(Long datasetId, int horizon, String question) throws Exception {
        List<DocumentChunkService.RetrievedSource> retrievedContext = aiRagService.retrieveContext(datasetId, question, 5);
        if (retrievedContext.isEmpty()) {
            var summary = analyticsService.computeSummary(datasetId);
            var risk = analyticsService.risk(datasetId);
            var drivers = analyticsService.topExpenseDrivers(datasetId, 12);
            var forecast = analyticsService.forecastWeeklyNet(datasetId, horizon);
            var weekly = analyticsService.computeWeeklySeries(datasetId);
            aiRagService.indexDataset(datasetId, summary, risk, drivers, forecast, weekly);
            retrievedContext = aiRagService.retrieveContext(datasetId, question, 5);
        }

        if (retrievedContext.isEmpty()) {
            // If chunk retrieval is unavailable, answer from deterministic analytics payload
            // so chat remains usable instead of hard-failing.
            var summary = analyticsService.computeSummary(datasetId);
            var risk = analyticsService.risk(datasetId);
            var drivers = analyticsService.topExpenseDrivers(datasetId, 12);
            var forecast = analyticsService.forecastWeeklyNet(datasetId, horizon);
            var weekly = analyticsService.computeWeeklySeries(datasetId);
            String fallbackContextJson = objectMapper.writeValueAsString(Map.of(
                    "datasetId", datasetId,
                    "summary", summary,
                    "risk", risk,
                    "topExpenseDrivers", drivers,
                    "forecastWeeklyNet", forecast,
                    "weeklySeries", weekly
            ));
            AiAnswerResponse llmAnswer = aiInsightsService.answerQuestion(fallbackContextJson, question);
            return new AiAnswerResponse(
                    llmAnswer.answer(),
                    llmAnswer.supportingPoints(),
                    List.of(),
                    "GROUNDING_FALLBACK_LLM"
            );
        }

        String ragContextJson = objectMapper.writeValueAsString(Map.of(
                "retrievedContext", retrievedContext.stream().map(DocumentChunkService.RetrievedSource::chunkText).toList()
        ));
        AiAnswerResponse llmAnswer = aiInsightsService.answerQuestion(ragContextJson, question);
        return new AiAnswerResponse(
                llmAnswer.answer(),
                llmAnswer.supportingPoints(),
                retrievedContext.stream().map(r -> new AiAnswerResponse.RetrievedSource(
                        r.id(),
                        r.chunkType(),
                        fullText(r.chunkText()),
                        r.similarity(),
                        r.metadata()
                )).toList(),
                "RAG+LLM"
        );
    }

    private String fullText(String text) {
        if (text == null) return "";
        return text.trim();
    }
}
