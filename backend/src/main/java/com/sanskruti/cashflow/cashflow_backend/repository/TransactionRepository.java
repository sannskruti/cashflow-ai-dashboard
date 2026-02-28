package com.sanskruti.cashflow.cashflow_backend.repository;
import com.sanskruti.cashflow.cashflow_backend.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface TransactionRepository extends JpaRepository<Transaction, Long> {

    List<Transaction> findByDatasetId(Long datasetId);
}