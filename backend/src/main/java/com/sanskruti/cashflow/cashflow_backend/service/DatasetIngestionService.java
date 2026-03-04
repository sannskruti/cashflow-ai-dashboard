package com.sanskruti.cashflow.cashflow_backend.service;
import com.sanskruti.cashflow.cashflow_backend.model.Dataset;
import com.sanskruti.cashflow.cashflow_backend.model.Transaction;
import com.sanskruti.cashflow.cashflow_backend.repository.DatasetRepository;
import com.sanskruti.cashflow.cashflow_backend.repository.TransactionRepository;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStreamReader;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class DatasetIngestionService {

    private static final Logger log = LoggerFactory.getLogger(DatasetIngestionService.class);

    private final DatasetRepository datasetRepository;
    private final TransactionRepository transactionRepository;
    private final AnalyticsService analyticsService;
    private final AiRagService aiRagService;

    public DatasetIngestionService(DatasetRepository datasetRepository,
                                   TransactionRepository transactionRepository,
                                   AnalyticsService analyticsService,
                                   AiRagService aiRagService) {
        this.datasetRepository = datasetRepository;
        this.transactionRepository = transactionRepository;
        this.analyticsService = analyticsService;
        this.aiRagService = aiRagService;
    }

    public Long ingestCsv(MultipartFile file, String datasetName) throws Exception {
        String filename = file.getOriginalFilename();
        if (filename == null || !filename.toLowerCase().endsWith(".csv")) {
            throw new IllegalArgumentException("Only CSV files are accepted");
        }
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Uploaded file is empty");
        }

        Dataset dataset = Dataset.builder()
                .name(datasetName)
                .uploadedAt(LocalDateTime.now())
                .build();

        dataset = datasetRepository.save(dataset);

        List<Transaction> txs = new ArrayList<>();

        try (CSVParser parser = CSVFormat.DEFAULT.builder()
                .setHeader()
                .setSkipHeaderRecord(true)
                .setTrim(true)
                .build()
                .parse(new InputStreamReader(file.getInputStream()))) {

            for (CSVRecord r : parser) {
                // expected columns: date,description,amount,type,category
                LocalDate date = LocalDate.parse(r.get("date"));
                String category = r.isMapped("category") ? r.get("category") : "uncategorized";
                String description = r.isMapped("description") ? r.get("description") : "";
                String type = r.get("type").trim().toUpperCase(); // INCOME / EXPENSE
                double amount = Double.parseDouble(r.get("amount"));

                // normalize: expenses should be negative
                if ("EXPENSE".equals(type) && amount > 0) amount = -amount;

                Transaction tx = Transaction.builder()
                        .date(date)
                        .category(category)
                        .description(description)
                        .type(type)
                        .amount(amount)
                        .dataset(dataset)
                        .build();

                txs.add(tx);
            }
        }

        transactionRepository.saveAll(txs);
        try {
            Long datasetId = dataset.getId();
            var summary = analyticsService.computeSummary(datasetId);
            var risk = analyticsService.risk(datasetId);
            var drivers = analyticsService.topExpenseDrivers(datasetId, 12);
            var forecast = analyticsService.forecastWeeklyNet(datasetId, 12);
            var weekly = analyticsService.computeWeeklySeries(datasetId);
            aiRagService.indexDataset(datasetId, summary, risk, drivers, forecast, weekly);
        } catch (Exception e) {
            log.warn("Chunk indexing failed for dataset {}: {}", dataset.getId(), e.getMessage());
        }
        return dataset.getId();
    }
    
}
