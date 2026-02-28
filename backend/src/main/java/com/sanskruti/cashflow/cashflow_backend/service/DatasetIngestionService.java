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

@Service
public class DatasetIngestionService {

       private final DatasetRepository datasetRepository;
    private final TransactionRepository transactionRepository;

    public DatasetIngestionService(DatasetRepository datasetRepository,
                                   TransactionRepository transactionRepository) {
        this.datasetRepository = datasetRepository;
        this.transactionRepository = transactionRepository;
    }

    public Long ingestCsv(MultipartFile file, String datasetName) throws Exception {
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
                String type = r.get("type").trim().toUpperCase(); // INCOME / EXPENSE
                double amount = Double.parseDouble(r.get("amount"));

                // normalize: expenses should be negative
                if ("EXPENSE".equals(type) && amount > 0) amount = -amount;

                Transaction tx = Transaction.builder()
                        .date(date)
                        .category(category)
                        .type(type)
                        .amount(amount)
                        .dataset(dataset)
                        .build();

                txs.add(tx);
            }
        }

        transactionRepository.saveAll(txs);
        return dataset.getId();
    }
    
}
