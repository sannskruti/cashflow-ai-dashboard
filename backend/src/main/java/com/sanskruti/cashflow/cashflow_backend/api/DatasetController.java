package com.sanskruti.cashflow.cashflow_backend.api;
import com.sanskruti.cashflow.cashflow_backend.api.dto.UploadResponse;
import com.sanskruti.cashflow.cashflow_backend.repository.TransactionRepository;
import com.sanskruti.cashflow.cashflow_backend.service.DatasetIngestionService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/datasets")
public class DatasetController {
    private final DatasetIngestionService ingestionService;
    private final TransactionRepository transactionRepository;

    public DatasetController(DatasetIngestionService ingestionService,
                             TransactionRepository transactionRepository) {
        this.ingestionService = ingestionService;
        this.transactionRepository = transactionRepository;
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
    
}
