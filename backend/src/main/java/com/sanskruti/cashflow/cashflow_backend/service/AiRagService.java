package com.sanskruti.cashflow.cashflow_backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanskruti.cashflow.cashflow_backend.api.dto.AiInsightsResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.DriverPoint;
import com.sanskruti.cashflow.cashflow_backend.api.dto.ForecastPoint;
import com.sanskruti.cashflow.cashflow_backend.api.dto.RiskResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.SummaryResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.WeeklyPoint;
import com.sanskruti.cashflow.cashflow_backend.model.Transaction;
import com.sanskruti.cashflow.cashflow_backend.repository.TransactionRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class AiRagService {

    private final DocumentChunkService documentChunkService;
    private final TransactionRepository transactionRepository;
    private final ObjectMapper objectMapper;

    public AiRagService(DocumentChunkService documentChunkService,
                        TransactionRepository transactionRepository,
                        ObjectMapper objectMapper) {
        this.documentChunkService = documentChunkService;
        this.transactionRepository = transactionRepository;
        this.objectMapper = objectMapper;
    }

    public void indexDataset(Long datasetId,
                             SummaryResponse summary,
                             RiskResponse risk,
                             List<DriverPoint> drivers,
                             List<ForecastPoint> forecast,
                             List<WeeklyPoint> weeklySeries) throws Exception {
        List<DocumentChunkService.ChunkInput> chunks = new ArrayList<>();

        chunks.add(new DocumentChunkService.ChunkInput(
                "summary",
                "Dataset " + datasetId + " summary: totalIncome=" + summary.totalIncome()
                        + ", totalExpense=" + summary.totalExpense()
                        + ", netCashflow=" + summary.netCashflow()
                        + ", avgWeeklyNet=" + summary.avgWeeklyNet()
                        + ", avgWeeklyExpense=" + summary.avgWeeklyExpense(),
                objectMapper.writeValueAsString(Map.of("datasetId", datasetId, "type", "summary"))
        ));

        chunks.add(new DocumentChunkService.ChunkInput(
                "risk",
                "Risk profile: score=" + risk.riskScore()
                        + ", negativeWeeksRatio=" + risk.negativeWeeksRatio()
                        + ", weeklyNetVolatility=" + risk.weeklyNetVolatility()
                        + ", reasons=" + String.join("; ", risk.reasons()),
                objectMapper.writeValueAsString(Map.of("datasetId", datasetId, "type", "risk"))
        ));

        for (DriverPoint d : drivers) {
            chunks.add(new DocumentChunkService.ChunkInput(
                    "category",
                    "Category expense driver: " + d.category() + " totalExpense=" + d.totalExpense(),
                    objectMapper.writeValueAsString(Map.of("datasetId", datasetId, "category", d.category(), "type", "category"))
            ));
        }

        for (WeeklyPoint w : weeklySeries) {
            chunks.add(new DocumentChunkService.ChunkInput(
                    "week",
                    "Weekly cashflow for " + w.weekStart() + ": income=" + w.income()
                            + ", expense=" + w.expense() + ", net=" + w.net(),
                    objectMapper.writeValueAsString(Map.of("datasetId", datasetId, "weekStart", w.weekStart(), "type", "week"))
            ));
        }

        for (ForecastPoint f : forecast) {
            chunks.add(new DocumentChunkService.ChunkInput(
                    "week",
                    "Forecast week " + f.weekStart() + " projectedNet=" + f.projectedNet(),
                    objectMapper.writeValueAsString(Map.of("datasetId", datasetId, "weekStart", f.weekStart(), "type", "forecast"))
            ));
        }

        List<Transaction> txs = transactionRepository.findByDatasetId(datasetId);
        int txLimit = Math.min(220, txs.size());
        for (int i = 0; i < txLimit; i++) {
            Transaction t = txs.get(i);
            chunks.add(new DocumentChunkService.ChunkInput(
                    "transaction",
                    "Transaction on " + t.getDate() + ": type=" + t.getType()
                            + ", category=" + t.getCategory() + ", amount=" + t.getAmount(),
                    objectMapper.writeValueAsString(Map.of(
                            "datasetId", datasetId,
                            "date", String.valueOf(t.getDate()),
                            "category", String.valueOf(t.getCategory()),
                            "type", "transaction"
                    ))
            ));
        }

        documentChunkService.replaceDatasetChunks(datasetId, chunks);
    }

    public void appendInsights(Long datasetId, AiInsightsResponse insights) throws Exception {
        List<DocumentChunkService.ChunkInput> insightsChunks = new ArrayList<>();

        insightsChunks.add(new DocumentChunkService.ChunkInput(
                "insight",
                "Executive summary: " + insights.executiveSummary(),
                objectMapper.writeValueAsString(Map.of("datasetId", datasetId, "type", "insight"))
        ));

        for (String d : insights.keyDrivers()) {
            insightsChunks.add(new DocumentChunkService.ChunkInput(
                    "insight",
                    "AI key driver: " + d,
                    objectMapper.writeValueAsString(Map.of("datasetId", datasetId, "type", "insight_key_driver"))
            ));
        }

        for (int i = 0; i < insights.recommendations().size(); i++) {
            AiInsightsResponse.Recommendation r = insights.recommendations().get(i);
            insightsChunks.add(new DocumentChunkService.ChunkInput(
                    "insight",
                    "Recommendation " + (i + 1) + ": action=" + r.action()
                            + ", impact=" + r.impact()
                            + ", effort=" + r.effort()
                            + ", timeframe=" + r.timeframe(),
                    objectMapper.writeValueAsString(Map.of("datasetId", datasetId, "type", "insight_recommendation"))
            ));
        }

        insightsChunks.add(new DocumentChunkService.ChunkInput(
                "insight",
                "Model confidence: " + insights.confidence(),
                objectMapper.writeValueAsString(Map.of("datasetId", datasetId, "type", "insight_confidence"))
        ));
        documentChunkService.appendDatasetChunks(datasetId, insightsChunks);
    }

    public List<DocumentChunkService.RetrievedSource> retrieveContext(Long datasetId, String question, int topK) {
        return documentChunkService.retrieve(datasetId, question, topK);
    }
}
