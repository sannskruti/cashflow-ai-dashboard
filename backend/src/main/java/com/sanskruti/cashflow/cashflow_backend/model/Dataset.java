package com.sanskruti.cashflow.cashflow_backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Dataset {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    private LocalDateTime uploadedAt;

    @OneToMany(mappedBy = "dataset", cascade = CascadeType.ALL)
    private List<Transaction> transactions;
}
