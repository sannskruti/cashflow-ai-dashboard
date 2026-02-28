package com.sanskruti.cashflow.cashflow_backend.repository;
import com.sanskruti.cashflow.cashflow_backend.model.Dataset;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DatasetRepository extends JpaRepository<Dataset, Long> {
}