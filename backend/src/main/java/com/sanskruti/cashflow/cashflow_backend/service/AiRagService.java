package com.sanskruti.cashflow.cashflow_backend.service;

import com.sanskruti.cashflow.cashflow_backend.api.dto.AiInsightsResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.DriverPoint;
import com.sanskruti.cashflow.cashflow_backend.api.dto.ForecastPoint;
import com.sanskruti.cashflow.cashflow_backend.api.dto.RiskResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.SummaryResponse;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AiRagService {

    private final AiInsightsService aiInsightsService;

    public AiRagService(AiInsightsService aiInsightsService) {
        this.aiInsightsService = aiInsightsService;
    }

    public List<String> retrieveContext(Long datasetId,
                                        SummaryResponse summary,
                                        RiskResponse risk,
                                        List<DriverPoint> drivers,
                                        List<ForecastPoint> forecast,
                                        AiInsightsResponse insights,
                                        String question,
                                        int topK) {
        List<String> chunks = buildKnowledgeChunks(datasetId, summary, risk, drivers, forecast, insights);
        List<List<Double>> chunkVectors = aiInsightsService.embedTexts(chunks);
        List<Double> queryVector = aiInsightsService.embedTexts(List.of(question)).get(0);

        List<ScoredChunk> scored = new ArrayList<>();
        for (int i = 0; i < chunks.size(); i++) {
            double score = cosineSimilarity(queryVector, chunkVectors.get(i));
            scored.add(new ScoredChunk(chunks.get(i), score));
        }

        return scored.stream()
                .sorted(Comparator.comparingDouble(ScoredChunk::score).reversed())
                .limit(topK)
                .map(ScoredChunk::text)
                .toList();
    }

    private List<String> buildKnowledgeChunks(Long datasetId,
                                              SummaryResponse summary,
                                              RiskResponse risk,
                                              List<DriverPoint> drivers,
                                              List<ForecastPoint> forecast,
                                              AiInsightsResponse insights) {
        List<String> chunks = new ArrayList<>();

        chunks.add("Dataset " + datasetId + " summary: totalIncome=" + summary.totalIncome()
                + ", totalExpense=" + summary.totalExpense()
                + ", netCashflow=" + summary.netCashflow()
                + ", avgWeeklyNet=" + summary.avgWeeklyNet()
                + ", avgWeeklyExpense=" + summary.avgWeeklyExpense());

        chunks.add("Risk profile: score=" + risk.riskScore()
                + ", negativeWeeksRatio=" + risk.negativeWeeksRatio()
                + ", weeklyNetVolatility=" + risk.weeklyNetVolatility()
                + ", reasons=" + String.join("; ", risk.reasons()));

        if (!drivers.isEmpty()) {
            String topDrivers = drivers.stream()
                    .map(d -> d.category() + "=" + d.totalExpense())
                    .reduce((a, b) -> a + ", " + b)
                    .orElse("");
            chunks.add("Top expense drivers: " + topDrivers);
        }

        if (!forecast.isEmpty()) {
            String first = forecast.get(0).weekStart() + ":" + forecast.get(0).projectedNet();
            String last = forecast.get(forecast.size() - 1).weekStart() + ":" + forecast.get(forecast.size() - 1).projectedNet();
            chunks.add("Forecast trend (first to last): " + first + " -> " + last + " over " + forecast.size() + " weeks");
        }

        chunks.add("Executive summary: " + insights.executiveSummary());

        if (!insights.keyDrivers().isEmpty()) {
            chunks.add("AI key drivers: " + String.join(", ", insights.keyDrivers()));
        }

        if (!insights.notes().isEmpty()) {
            chunks.add("AI notes: " + String.join("; ", insights.notes()));
        }

        for (int i = 0; i < insights.recommendations().size(); i++) {
            AiInsightsResponse.Recommendation r = insights.recommendations().get(i);
            chunks.add("Recommendation " + (i + 1) + ": action=" + r.action()
                    + ", impact=" + r.impact()
                    + ", effort=" + r.effort()
                    + ", timeframe=" + r.timeframe());
        }

        chunks.add("Model confidence: " + insights.confidence());
        return chunks;
    }

    private double cosineSimilarity(List<Double> a, List<Double> b) {
        int n = Math.min(a.size(), b.size());
        double dot = 0.0;
        double normA = 0.0;
        double normB = 0.0;
        for (int i = 0; i < n; i++) {
            double av = a.get(i);
            double bv = b.get(i);
            dot += av * bv;
            normA += av * av;
            normB += bv * bv;
        }
        if (normA == 0 || normB == 0) {
            return 0.0;
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    private record ScoredChunk(String text, double score) {}
}
