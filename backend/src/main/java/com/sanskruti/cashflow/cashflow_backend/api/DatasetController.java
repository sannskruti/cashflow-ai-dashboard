package com.sanskruti.cashflow.cashflow_backend.api;
import com.sanskruti.cashflow.cashflow_backend.api.dto.UploadResponse;
import com.sanskruti.cashflow.cashflow_backend.model.Transaction;
import com.sanskruti.cashflow.cashflow_backend.repository.DatasetRepository;
import com.sanskruti.cashflow.cashflow_backend.repository.TransactionRepository;
import com.sanskruti.cashflow.cashflow_backend.service.DatasetIngestionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/datasets")
public class DatasetController {
    private final DatasetIngestionService ingestionService;
    private final TransactionRepository transactionRepository;
    private final DatasetRepository datasetRepository;

    public DatasetController(DatasetIngestionService ingestionService,
                             TransactionRepository transactionRepository,
                             DatasetRepository datasetRepository) {
        this.ingestionService = ingestionService;
        this.transactionRepository = transactionRepository;
        this.datasetRepository = datasetRepository;
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UploadResponse upload(@RequestPart("file") MultipartFile file,
                                 @RequestParam(defaultValue = "uploaded-dataset") String name) throws Exception {
        Long id = ingestionService.ingestCsv(file, name);
        return new UploadResponse(id);
    }

    @GetMapping("/{id}/count")
    public long count(@PathVariable Long id) {
        return transactionRepository.findByDatasetId(id).size();
    }

    @GetMapping("/{id}/transactions")
    public TransactionPageResponse listTransactions(@PathVariable Long id,
                                                    @RequestParam(defaultValue = "0") int page,
                                                    @RequestParam(defaultValue = "20") int size,
                                                    @RequestParam(required = false) String search,
                                                    @RequestParam(required = false) String type,
                                                    @RequestParam(required = false) String category) {
        ensureDatasetExists(id);
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 50);
        String normalizedSearch = normalize(search);
        String normalizedType = normalize(type);
        if (normalizedType != null) {
            normalizedType = normalizedType.toUpperCase(Locale.ROOT);
        }
        String normalizedCategory = normalize(category);
        String searchLike = normalizedSearch == null ? null : "%" + normalizedSearch + "%";
        String categoryLike = normalizedCategory == null ? null : normalizedCategory;

        Page<Transaction> data = transactionRepository.searchDatasetTransactions(
                id,
                normalizedSearch,
                searchLike,
                normalizedType,
                normalizedCategory,
                categoryLike,
                PageRequest.of(safePage, safeSize)
        );

        List<TransactionRowResponse> rows = data.getContent().stream()
                .map(TransactionRowResponse::fromEntity)
                .toList();

        return new TransactionPageResponse(
                rows,
                data.getNumber(),
                data.getSize(),
                data.getTotalElements(),
                data.getTotalPages()
        );
    }

    @GetMapping("/{id}/transactions/categories")
    public List<String> transactionCategories(@PathVariable Long id) {
        ensureDatasetExists(id);
        return transactionRepository.findDistinctCategoriesByDatasetId(id);
    }

    @PutMapping("/{id}/transactions/{transactionId}")
    public TransactionRowResponse updateTransaction(@PathVariable Long id,
                                                    @PathVariable Long transactionId,
                                                    @Valid @RequestBody UpdateTransactionRequest request) {
        ensureDatasetExists(id);
        Transaction tx = transactionRepository.findById(transactionId)
                .filter(t -> t.getDataset() != null && id.equals(t.getDataset().getId()))
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Transaction not found"));

        tx.setDescription(request.description() == null ? "" : request.description().trim());
        return TransactionRowResponse.fromEntity(transactionRepository.save(tx));
    }

    @DeleteMapping("/{id}/transactions/{transactionId}")
    public void deleteTransaction(@PathVariable Long id,
                                  @PathVariable Long transactionId) {
        ensureDatasetExists(id);
        Transaction tx = transactionRepository.findById(transactionId)
                .filter(t -> t.getDataset() != null && id.equals(t.getDataset().getId()))
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Transaction not found"));
        transactionRepository.delete(tx);
    }

    private void ensureDatasetExists(Long datasetId) {
        if (!datasetRepository.existsById(datasetId)) {
            throw new ResponseStatusException(NOT_FOUND, "Dataset not found");
        }
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public record UpdateTransactionRequest(@Size(max = 2000) String description) {}

    public record TransactionRowResponse(
            Long id,
            LocalDate date,
            String category,
            String description,
            Double amount,
            String type
    ) {
        static TransactionRowResponse fromEntity(Transaction tx) {
            return new TransactionRowResponse(
                    tx.getId(),
                    tx.getDate(),
                    tx.getCategory(),
                    tx.getDescription(),
                    tx.getAmount(),
                    tx.getType()
            );
        }
    }

    public record TransactionPageResponse(
            List<TransactionRowResponse> items,
            int page,
            int size,
            long totalElements,
            int totalPages
    ) {}
    
}
