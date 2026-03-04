package com.sanskruti.cashflow.cashflow_backend.model;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Transaction {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDate date;

    private String category;

    @Column(length = 2000)
    private String description;

    private Double amount;

    private String type; // INCOME or EXPENSE

    @ManyToOne
    @JoinColumn(name = "dataset_id")
    private Dataset dataset;
    
}
